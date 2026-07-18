// server/src/config.js — re-export della config condivisa (single source of truth)
// Il server e il client usano lo stesso file: shared/config.js
// (il client lo riceve via HTTP su /js/config.js, vedi index.js)

'use strict';

module.exports = require('../../shared/config.js');
