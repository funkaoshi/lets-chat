'use strict';

const globals = require('globals');

module.exports = [
    {
        ignores: ['media/**', 'node_modules/**']
    },
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: { ...globals.node }
        },
        rules: {
            'no-underscore-dangle': 'off',
            quotes: ['error', 'single'],
            strict: ['error', 'global'],

            'consistent-return': 'off',

            // Disable certain checks until we have time to fix these issues
            'no-shadow': 'off',
            camelcase: 'off',
            'no-path-concat': 'off',
            'no-process-exit': 'off',
            'new-cap': 'off'
        }
    }
];
