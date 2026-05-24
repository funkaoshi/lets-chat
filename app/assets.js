//
// Asset pipeline
//
// In-tree replacement for the unmaintained `connect-assets` package
// (last meaningful release 2018; its `less@2.7.x` transitive chain was
// the source of the residual 19 CVEs after the rest of the modernization
// pass).
//
// What it does, narrowly:
//
//   1. JS bundling: expands `//= require X` Sprockets-style directives
//      in each entry file. Resolves `X` against a configurable search
//      path (defaults: media/js, node_modules). Outputs one concatenated
//      file per entry.
//   2. LESS compilation: runs less.render() per entry, with the same
//      paths for `@import` resolution.
//   3. Build mode: synchronous build at startup. In dev, a per-request
//      mtime check rebuilds bundles whose sources changed.
//   4. Nunjucks filters: `'<name>' | js` / `'<name>' | css` emit the
//      `<script>` / `<link>` tag pointing at /media/dist/<name>.<ext>.
//      The built files live on disk under media/dist/ and are served by
//      the existing `app.use('/media', express.static(...))` mount.
//
// What it deliberately doesn't do (vs connect-assets):
//
//   - No fingerprinting / cache-busting URLs. The /media static mount
//     sets a long max-age; bumping a query string on deploys is enough
//     for this app's traffic.
//   - No minification. The previous setup didn't minify either.
//   - No source maps. None of the bundles set them up before.
//

'use strict';

var fs = require('fs'),
    path = require('path'),
    less = require('less');

var ROOT = path.resolve(__dirname, '..');

// Walk a JS entry file, expanding `//= require X` directives. Each X is
// resolved against `searchPaths`. Already-seen files are skipped so the
// same module doesn't get pulled in twice.
function expandJS(entryFile, searchPaths) {
    var seen = new Set();
    var chunks = [];
    var sources = []; // for mtime tracking

    function resolveRequire(req, fromDir) {
        // Try same dir first (relative-ish), then each searchPath.
        var candidates = [];
        if (path.isAbsolute(req)) {
            candidates.push(req);
        } else {
            candidates.push(path.resolve(fromDir, req));
            searchPaths.forEach(function(p) {
                candidates.push(path.resolve(ROOT, p, req));
            });
        }
        for (var i = 0; i < candidates.length; i++) {
            if (fs.existsSync(candidates[i])) return candidates[i];
        }
        throw new Error('asset require not found: ' + req +
                        ' (from ' + fromDir + ')');
    }

    function visit(file) {
        if (seen.has(file)) return;
        seen.add(file);
        sources.push(file);
        var src = fs.readFileSync(file, 'utf8');
        var lines = src.split(/\r?\n/);
        var fromDir = path.dirname(file);
        var out = [];
        lines.forEach(function(line) {
            var m = line.match(/^\s*\/\/=\s*require\s+(.+?)\s*$/);
            if (m) {
                var target = resolveRequire(m[1], fromDir);
                visit(target);
            } else {
                out.push(line);
            }
        });
        chunks.push('/* === ' + path.relative(ROOT, file) + ' === */\n' +
                    out.join('\n'));
    }

    visit(entryFile);
    return { code: chunks.join('\n'), sources: sources };
}

// Compile a LESS entry. less.render handles @import + @import (inline)
// natively given the paths option.
function compileLess(entryFile, searchPaths) {
    var src = fs.readFileSync(entryFile, 'utf8');
    var opts = {
        filename: entryFile,
        paths: [path.dirname(entryFile)].concat(
            searchPaths.map(function(p) { return path.resolve(ROOT, p); })
        ),
        // hat.less defines the .translate3d/.translateX/etc. mixins using
        // backtick inline-JS to coerce numeric args into px. Less 4 disabled
        // inline JS by default for safety; the lever is meaningless here
        // since all .less input is committed in-tree.
        javascriptEnabled: true
    };
    // less.render is async; we await it from a wrapper. Returns a
    // Promise<{ css, sources }>.
    return less.render(src, opts).then(function(result) {
        // result.imports lists every file that was @import'd (recursively).
        var sources = [entryFile].concat(result.imports || []);
        return { code: result.css, sources: sources };
    });
}

// Latest mtime across a list of files. If any file is missing, return
// Infinity to force a rebuild.
function newestMtime(files) {
    var newest = 0;
    for (var i = 0; i < files.length; i++) {
        try {
            var st = fs.statSync(files[i]);
            if (st.mtimeMs > newest) newest = st.mtimeMs;
        } catch (err) {
            return Infinity;
        }
    }
    return newest;
}

// Public API. Construct with config; call build() once before listen;
// call installFilters(nunjucksEnv) after Nunjucks is configured.
module.exports = function createAssets(config) {
    var jsPaths = (config.jsPaths || ['media/js', 'node_modules']);
    var cssPaths = (config.cssPaths || ['media/less', 'node_modules']);
    var jsEntries = config.jsEntries || [];
    var cssEntries = config.cssEntries || [];
    var distDir = path.resolve(ROOT, config.distDir || 'media/dist');
    var isProd = !!config.production;

    // In-memory record of last build per entry so we can mtime-check in
    // dev without re-reading the dist files.
    var jsState = {};  // name -> { sources, mtime }
    var cssState = {};

    function ensureDistDir() {
        fs.mkdirSync(distDir, { recursive: true });
    }

    function writeDist(rel, code) {
        var full = path.join(distDir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, code);
    }

    function buildJSEntry(name) {
        var entryFile = path.resolve(ROOT, 'media/js', name + '.js');
        var result = expandJS(entryFile, jsPaths);
        writeDist(name + '.js', result.code);
        jsState[name] = {
            sources: result.sources,
            mtime: Date.now()
        };
    }

    function buildCSSEntry(name) {
        var entryFile = path.resolve(ROOT, 'media/less', name + '.less');
        return compileLess(entryFile, cssPaths).then(function(result) {
            writeDist(name + '.css', result.code);
            cssState[name] = {
                sources: result.sources,
                mtime: Date.now()
            };
        });
    }

    async function build() {
        ensureDistDir();
        jsEntries.forEach(buildJSEntry);
        for (var i = 0; i < cssEntries.length; i++) {
            await buildCSSEntry(cssEntries[i]);
        }
    }

    // In dev, called from a middleware. Rebuilds the named entry if any
    // tracked source is newer than the last build.
    function maybeRebuildJS(name) {
        var st = jsState[name];
        if (!st) { buildJSEntry(name); return; }
        if (newestMtime(st.sources) > st.mtime) {
            buildJSEntry(name);
        }
    }

    async function maybeRebuildCSS(name) {
        var st = cssState[name];
        if (!st) { await buildCSSEntry(name); return; }
        if (newestMtime(st.sources) > st.mtime) {
            await buildCSSEntry(name);
        }
    }

    // Express middleware: in dev, intercept GETs to /media/dist/<name>.<ext>
    // and mtime-rebuild before falling through to express.static.
    function middleware() {
        return function(req, res, next) {
            if (isProd) return next();
            if (req.method !== 'GET' && req.method !== 'HEAD') return next();
            var m = req.path.match(/^\/media\/dist\/([^/]+)\.(js|css)$/);
            if (!m) return next();
            var name = m[1], ext = m[2];
            try {
                if (ext === 'js' && jsEntries.indexOf(name) !== -1) {
                    maybeRebuildJS(name);
                    return next();
                }
                if (ext === 'css' && cssEntries.indexOf(name) !== -1) {
                    return maybeRebuildCSS(name).then(function() { next(); }, next);
                }
            } catch (err) {
                return next(err);
            }
            next();
        };
    }

    // Register Nunjucks `js` / `css` filters. Mirrors the connect-assets
    // helper signature so existing templates (<$ 'vendor' | js | safe $>)
    // keep working unchanged.
    function installFilters(env) {
        env.addFilter('js', function(name) {
            return '<script src="/media/dist/' + name + '.js"></script>';
        });
        env.addFilter('css', function(name) {
            return '<link rel="stylesheet" href="/media/dist/' + name + '.css">';
        });
    }

    return {
        build: build,
        middleware: middleware,
        installFilters: installFilters
    };
};
