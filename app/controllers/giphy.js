//
// Giphy Controller
//
// Server-side proxy for the Giphy search API. Keeps the apiKey out of
// the rendered HTML — the client used to read it from data-apikey on
// the modal element and call api.giphy.com directly.
//

'use strict';

var settings = require('./../config').giphy;

module.exports = function() {

    var app = this.app,
        middlewares = this.middlewares;

    app.get('/extras/giphy/search', middlewares.requireLogin, async function(req, res) {
        if (!settings || !settings.enable) {
            return res.sendStatus(404);
        }

        var q = (req.query.q || '').toString().trim();
        if (!q) {
            return res.json([]);
        }

        var url = 'https://api.giphy.com/v1/gifs/search?' + new URLSearchParams({
            api_key: settings.apiKey,
            q: q,
            rating: settings.rating,
            limit: settings.limit
        });

        try {
            var response = await fetch(url);
            if (!response.ok) {
                return res.sendStatus(502);
            }
            var payload = await response.json();
            var images = (payload.data || [])
                .map(function(entry) {
                    return entry.images && entry.images.fixed_width && entry.images.fixed_width.url;
                })
                .filter(Boolean);
            res.json(images);
        } catch (err) {
            res.sendStatus(502);
        }
    });

};
