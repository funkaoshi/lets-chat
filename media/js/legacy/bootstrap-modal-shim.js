/**
 * Bootstrap 5 dropped jQuery plugin support. The existing Backbone views in
 * media/js/views/ call $(el).modal('show'/'hide') as if BS3/4 were loaded.
 *
 * This shim re-attaches a minimal jQuery plugin that delegates to BS5's
 * vanilla bootstrap.Modal API. Existing call sites keep working without
 * changes; when we eventually drop jQuery + Backbone, this file goes too.
 *
 * Supported call shapes (all that the codebase actually uses):
 *   $(el).modal()                  // construct + show
 *   $(el).modal('show'|'hide'|'toggle'|'dispose')
 *   $(el).modal({ ...options })    // construct with options, show
 *
 * Returns the jQuery wrapper so call chains keep working.
 */
(function ($, bootstrap) {
    'use strict';

    if (!$ || !bootstrap || !bootstrap.Modal) {
        // Fail loud during development — the load order in vendor.js must
        // put bootstrap.bundle.js before this shim.
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[bootstrap-modal-shim] jQuery or bootstrap.Modal missing — shim inert.');
        }
        return;
    }

    var ACTIONS = { show: 'show', hide: 'hide', toggle: 'toggle', dispose: 'dispose' };

    $.fn.modal = function (arg) {
        return this.each(function () {
            var instance = bootstrap.Modal.getOrCreateInstance(this, typeof arg === 'object' ? arg : {});
            if (typeof arg === 'string' && ACTIONS[arg]) {
                instance[arg]();
            } else if (arg === undefined || typeof arg === 'object') {
                instance.show();
            }
        });
    };
})(window.jQuery, window.bootstrap);
