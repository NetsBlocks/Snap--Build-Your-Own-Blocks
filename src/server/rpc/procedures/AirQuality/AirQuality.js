// This will use the AirNowAPI to get air quality given a latitude and longitude.
// If we start to run out of API requests, they have the entire dataset available
// for download online.
//
// This is a static rpc collection. That is, it does not maintain state and is 
// shared across groups
'use strict';

var debug = require('debug'),
    error = debug('NetsBlox:RPCManager:AirQuality:error'),
    trace = debug('NetsBlox:RPCManager:AirQuality:trace'),
    API_KEY = process.env.AIR_NOW_KEY,
    path = require('path'),
    fs = require('fs'),
    geolib = require('geolib'),
    request = require('request');

var baseUrl = 'http://www.airnowapi.org/aq/forecast/zipCode/?format=application/' + 
        'json&API_KEY=' + API_KEY,
    reportingLocations = (function() {  // Parse csv
        var locationPath = path.join(__dirname, 'air-reporting-locations.csv'),
            text = fs.readFileSync(locationPath, 'utf8'),
            rawLocations = text.split('\n');

        rawLocations.pop();  // Remove trailing \n
        rawLocations.shift();  // Remove header
        return rawLocations
            .map(function(line) {
                var data = line.split('|');
                return {
                    city: data[0],
                    state: data[1],
                    zipcode: data[2],
                    latitude: +data[3],
                    longitude: +data[4]
                };
            });
    })();


var getClosestReportingLocation = function(lat, lng) {
    var nearest = geolib.findNearest({latitude: lat, longitude: lng}, reportingLocations),
        city = reportingLocations[nearest.key].city,
        state = reportingLocations[nearest.key].state,
        zipcode = reportingLocations[nearest.key].zipcode;
    trace('Nearest reporting location is ' + city + ', ' + state);
    return zipcode;
};

var qualityIndex = function(latitude, longitude) {
    var nearest,
        url;

    trace(`Requesting air quality at ${latitude}, ${longitude}`);
    if (!latitude || !longitude) {
        return this.response.status(400).send('ERROR: missing latitude or longitude');
    }

    nearest = getClosestReportingLocation(latitude, longitude);
    url = baseUrl + '&zipCode=' + nearest;

    trace('Requesting air quality at '+ nearest);
    
    request(url, (err, response, body) => {
        var aqi = -1,
            code = err ? 500 : response.statusCode;
        try {
            body = JSON.parse(body).shift();
            if (body && body.AQI) {
                aqi = +body.AQI;
                trace('Air quality at '+ nearest + ' is ' + aqi);
            }
        } catch (e) {
            // Just send -1 if anything bad happens
            error('Could not get air quality index: ', e);
        }

        this.response.status(code).json(aqi);
    });

    return null;
};

module.exports = {

    // This is very important => Otherwise it will try to instantiate this
    isStateless: true,
    COMPATIBILITY: {
        aqi: {
            latitude: 'lat',
            longitude: 'lng'
        }
    },

    // These next two functions are the same from the stateful RPC's
    getPath: function() {
        return '/air';
    },

    // air quality index
    // Return -1 if unknown
    aqi: qualityIndex,
    qualityIndex: qualityIndex
};
