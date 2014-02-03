/**
 * REST API that connects to the public Next Bus API (XML) and returns JSON structures
 *
 * Services:
 *
 * Get list of all agencies: /agencies
 * Get list of all routes for a specific agency: /agency/<agencyid>/routes
 * Get a schedule for a concrete route of a specific agency: /agency/<agencyid>/route/<routeid>/schedule
 *
 * Samples:
 *
 * Get list of all agencies: http://localhost:8081/agencies
 * Get list of all routes for a specific agency: http://localhost:8081/agency/actransit/routes
 * Get a schedule for a concrete route of a specific agency: http://localhost:8081/agency/actransit/route/275/schedule
 *
 * Created by kaarek on 28/01/14.
 */
var HashMap = require('hashmap').HashMap;
var Datastore = require('nedb')
  , db = new Datastore();

var geohash = require("geohash").GeoHash;

var querystring = require('querystring');
var http = require('http');
var libxmljs = require('libxmljs');

var HOST = 'webservices.nextbus.com';
var BASEPATH = '/service/publicXMLFeed';

var async = require('async');

/**
 * Internal helper operation for executing an HTTP GET
 *
 * @param host
 * @param endpoint
 * @param success
 */
function doGet(host, endpoint, success) {

    console.log('Perform get:' + host + endpoint);// + ' agency:' + agency + ' route:' + route + ' lat:' + lat + ' lon:' + lon + ' success:' + success);

    var options = {
        host: host,
        port: 80,
        path: endpoint,
        method: 'GET',
        headers: {}
    };

    var req = http.request(options, function(res) {

        //console.log("statusCode: ", res.statusCode);
        //console.log("headers: ", res.headers);

        res.setEncoding('utf-8');

        var xml = '';

        res.on('data', function(data) {
            xml += data;
        });

        res.on('end', function() {

            var dom = libxmljs.parseXml(xml);

            //console.log('doGet: ' + dom);
            success(dom);


        });
    });

    req.end();
}

function initialize() {

    // Load all static route data from the web services and store into database
    addAgenciesToDB();
}

function addAgenciesToDB() {
    var endpoint = BASEPATH + '?' + querystring.stringify({command: 'agencyList'});
    doGet(HOST, endpoint, function(dom) {

        var result = [];

        var agencyNodeList = dom.find('//agency');
        for (var i = 0; i < agencyNodeList.length; ++i) {

            var agencyTag = agencyNodeList[i].attr('tag').value();
            var agencyTitle = agencyNodeList[i].attr('title').value()
            var agencyRegionTitle = agencyNodeList[i].attr('regionTitle').value();

            addRouteConfigToDB(agencyTag, agencyTitle, agencyRegionTitle);
        }
    });
}

/**
 * Internal helper: store route and agency data to database
 * @param agencyTag
 * @param agencyTitle
 * @param agencyRegionTitle
 */
function addRouteConfigToDB(agencyTag, agencyTitle, agencyRegionTitle) {
    var endpoint3 = BASEPATH + '?' + querystring.stringify({command: 'routeConfig', a: agencyTag})

    console.log('endpoint3:' + endpoint3);

    doGet(HOST, endpoint3, function(dom3) {

        var routeNodeList = dom3.find('//route');
        if(routeNodeList.length > 0) {

            var latMin = routeNodeList[0].attr('latMin').value();
            var lonMin = routeNodeList[0].attr('lonMin').value();
            var geoHash =  geohash.encodeGeoHash(latMin, lonMin);

            console.log('agency: ' + agencyTitle + ' tag:' + agencyTag + ' geohash:' + geoHash);

            db.insert({agency: {tag: agencyTag, title: agencyTitle, region: agencyRegionTitle, lat: latMin, lon: lonMin, geohash: geoHash}});

        } else {
            console.log("Error(routeConfig): No routedetails for agencytag:" + agencyTag + ", agency:" + agencyTitle);
        }

        for (var i = 0; i < routeNodeList.length; ++i) {

            var latMin = routeNodeList[i].attr('latMin').value();
            var lonMin = routeNodeList[i].attr('lonMin').value();
            var latMax = routeNodeList[i].attr('latMax').value();
            var lonMax = routeNodeList[i].attr('lonMax').value();
            var routeTag = routeNodeList[i].attr('tag').value();
            var routeTitle = routeNodeList[i].attr('title').value();
            var geoHash =  geohash.encodeGeoHash(latMin, lonMin);

            console.log('route: ' + agencyTag + '=' + agencyTitle + ' route:' + routeTitle + 'lat:' + latMin + ' lon:' + lonMin + ' geohash:' + geoHash);

            db.insert({route: {agencyTitle: agencyTitle, agencytag: agencyTag, region: agencyRegionTitle, routetag: routeTag, title: routeTitle, latmin: latMin, latmax: latMax, lonmin: lonMin, lonmax: lonMax, geohash: geoHash}});
        }

    });
}

/**
 * Find any routes near lat, lon with specified geohash precision
 *
 * @param request.lat Latitude of coordinate
 * @param request.lon Longitude of coordinate
 * @param request.precision integer value of 2-11 denoting precision of geohash (substring search)
 * @param response HTTP response object
 */
function routesNearCoordinate(request, response) {

    var lat = request.params.lat;
    var lon = request.params.lon;
    var precision = request.params.precision;

    var geoHash = geohash.encodeGeoHash(lat, lon);
    var geoHashTruncate = geoHash.substring(0, precision);

    console.log("Looking for geohash:" + geoHash + ' short:' + geoHashTruncate);

    var top = geohash.calculateAdjacent(geoHash, 'top');
    var bottom = geohash.calculateAdjacent(geoHash, 'bottom');
   	var right = geohash.calculateAdjacent(geoHash, 'right');
   	var left = geohash.calculateAdjacent(geoHash, 'left');
    var topleft = geohash.calculateAdjacent(left, 'top');
   	var topright = geohash.calculateAdjacent(right, 'top');
   	var bottomright = geohash.calculateAdjacent(right, 'bottom');
   	var bottomleft = geohash.calculateAdjacent(left, 'bottom');

    var geoHashList = [
        {"route.geohash": new RegExp(geoHashTruncate)},
        {"route.geohash": new RegExp(top)},
        {"route.geohash": new RegExp(bottom)},
        {"route.geohash": new RegExp(right)},
        {"route.geohash": new RegExp(left)},
        {"route.geohash": new RegExp(topleft)},
        {"route.geohash": new RegExp(topright)},
        {"route.geohash": new RegExp(bottomright)},
        {"route.geohash": new RegExp(bottomleft)}];

    console.log("geoHashList:" + JSON.stringify(geoHashList));

    db.find({$or: geoHashList}, function (err, docs) {

        response.send(JSON.stringify(docs))

    });

}

/**
 * Find any angecies near lat, lon
 *
 * @param request.lat Latitude of coordinate
 * @param request.lon Longitude of coordinate
 * @param response HTTP response object
 */
function agenciesNearCoordinate(request, response) {

    var lat = request.params.lat;
    var lon = request.params.lon;

    var geoHash = geohash.encodeGeoHash(lat, lon);
    var geoHashTruncate = geoHash.substring(0, 2);

    console.log("Looking for geohash:" + geoHash + ' short:' + geoHashTruncate);

    var top = geohash.calculateAdjacent(geoHash, 'top');
    var bottom = geohash.calculateAdjacent(geoHash, 'bottom');
   	var right = geohash.calculateAdjacent(geoHash, 'right');
   	var left = geohash.calculateAdjacent(geoHash, 'left');
    var topleft = geohash.calculateAdjacent(left, 'top');
   	var topright = geohash.calculateAdjacent(right, 'top');
   	var bottomright = geohash.calculateAdjacent(right, 'bottom');
   	var bottomleft = geohash.calculateAdjacent(left, 'bottom');

    var geoHashList = [
        {"agency.geohash": new RegExp(geoHashTruncate)},
        {"agency.geohash": new RegExp(top)},
        {"agency.geohash": new RegExp(bottom)},
        {"agency.geohash": new RegExp(right)},
        {"agency.geohash": new RegExp(left)},
        {"agency.geohash": new RegExp(topleft)},
        {"agency.geohash": new RegExp(topright)},
        {"agency.geohash": new RegExp(bottomright)},
        {"agency.geohash": new RegExp(bottomleft)}];

    console.log("geoHashList:" + geoHashList);

    db.find({$or: geoHashList}, function (err, docs) {

        response.send(JSON.stringify(docs))

    });

}

/**
 * Find all regions with coordinates and geo hash
 *
 * @param request.lat Latitude of coordinate
 * @param request.lon Longitude of coordinate
 * @param response HTTP response object
 */
function regions(request, response) {

    console.log("get all regions");

    db.find({"agency.region": new RegExp('.')}, function (err, docs) {

        var map = new HashMap();
        var result = [];

        for(var i = 0; i < docs.length; i++) {

            var agency = docs[i].agency;
            var key = agency.region;

            if(!map.has(key)) {
                map.set(key, key);
                result.push(
                    {
                        region: agency.region,
                        lat: agency.lat,
                        lon: agency.lon,
                        geohash: agency.geohash
                    })
                console.log('key:' + key + ' = ' + JSON.stringify(agency));
            }
        }

        response.send(JSON.stringify(result))

    });

}

/**
 * JSON REST service: Return all routes for a specific agency
 * @param request.agencyid ID of the agency
 * @param response
 */
function agencyRoutes(request, response) {
    var endpoint = BASEPATH + '?' + querystring.stringify({command: 'routeList', a: request.params.agencyid});;
    doGet(HOST, endpoint, function(dom) {

        console.log(dom);

        var result = {
            routes : []
        }

        // Run thru the DOM and produce a JSON structure
        var agencyNodeList = dom.find('//route');
        for (var i = 0; i < agencyNodeList.length; ++i) {

            var tag = agencyNodeList[i].attr('tag').value();
            var title = agencyNodeList[i].attr('title').value()

            console.log(tag + '=' + title);

            result.routes.push({"route" : {"tag:" : tag, "title" : title}});
        }

        response.send(JSON.stringify(result));

    });
}

/**
 * JSON REST service: Return a schedule for a specific route and agency.
 * Use agencies to get agency ids
 * Use agencyRoutes to get route ids
 *
 * @param request.agencyid ID of the agency
 * @param request.routeid ID of the route
 * @param response
 */
function agencyRouteSchedule(request, response) {
    var endpoint = BASEPATH + '?' + querystring.stringify({command: 'schedule', a: request.params.agencyid, r: request.params.routeid});;
    doGet(HOST, endpoint, function(dom) {

        console.log(dom);

        var routeNode = dom.find('//route')[0];

        if(routeNode) {
            var result = {
                route : {
                    "tag" : routeNode.attr('tag').value(),
                    "title" : routeNode.attr('title').value(),
                    "scheduleClass" : routeNode.attr('scheduleClass').value(),
                    "serviceClass" : routeNode.attr('serviceClass').value(),
                    "direction" : routeNode.attr('direction').value(),
                    "header" : [],
                    "schedule" : []
                }
            }

            // Run thru the header stops and add those to the header element
            var routeHeaderStopNodeList = routeNode.find('header/stop');
            for (var i = 0; i < routeHeaderStopNodeList .length; ++i) {

                var tag = routeHeaderStopNodeList[i].attr('tag').value();
                var title = routeHeaderStopNodeList[i].text()

                console.log(tag + '=' + title);

                result.route.header.push({"stop" : {"tag" : tag, "title" : title}});
            }

            // Run thru the indiviual timed routes
            var timedRouteNodeList = dom.find('//tr');
            for (var tr = 0; tr < timedRouteNodeList.length; ++tr) {

                var stopsNodeList = timedRouteNodeList[tr].find('stop');

                for(var s = 0; s < stopsNodeList.length; ++s) {

                    var tag = stopsNodeList[s].attr('tag').value();
                    var title = stopsNodeList[s].text()

                    console.log(tag + '=' + title);

                    result.route.schedule.push({"stop" : {"tag:" : tag, "title" : title}});

                }
            }
        }

        response.send(JSON.stringify(result));
    });
}

function nextAgencyRouteSchedule(request, response) {
    var endpoint = BASEPATH + '?' + querystring.stringify({command: 'schedule', a: request.params.agencyid, r: request.params.routeid});;
    doGet(HOST, endpoint, function(dom) {

        console.log(dom);

        var routeNode = dom.find('//route')[0];

        if(routeNode) {
            var result = {
                route : {
                    "tag" : routeNode.attr('tag').value(),
                    "title" : routeNode.attr('title').value(),
                    "scheduleClass" : routeNode.attr('scheduleClass').value(),
                    "serviceClass" : routeNode.attr('serviceClass').value(),
                    "direction" : routeNode.attr('direction').value(),
                    "header" : [],
                    "schedule" : []
                }
            }

            var titleMap = new HashMap();

            var routeHeaderStopNodeList = dom.find('//header/stop');
            for (var i = 0; i < routeHeaderStopNodeList.length; ++i) {

                var tag = routeHeaderStopNodeList[i].attr('tag').value();
                var title = routeHeaderStopNodeList[i].text()

                titleMap.set(tag, title);
            }

            // Run thru the indiviual timed routes
            var tagMap = new HashMap();
            var timedRouteNodeList = dom.find('//tr');
            var now = new Date();

            for (var tr = 0; tr < timedRouteNodeList.length; ++tr) {

                var stopsNodeList = timedRouteNodeList[tr].find('stop');

                for(var s = 0; s < stopsNodeList.length; ++s) {

                    console.log("Found:" + tag + '=' + time + ' now:' + now + ' ' + (now < time));

                    var tag = stopsNodeList[s].attr('tag').value();
                    var title = titleMap.get(tag);
                    var time = stopsNodeList[s].text().split(':');
                    var date = new Date();
                    date.setHours(time[0]);
                    date.setMinutes(time[1]);
                    date.setSeconds(time[2]);

                    console.log("Compare dates:" + date + ',' + now);

                    if(now.getTime() < date.getTime() && !tagMap.has(tag)) {

                        console.log('add: ' + tag + '=' + title + ', time:' + time);

                        tagMap.set(tag, tag);

                        result.route.schedule.push({"stop" : {"tag:" : tag, "title" : title, "time" : time}});
                    }
                }
            }
        }

        response.send(JSON.stringify(result));
    });
}


// Exported functions
exports.initalize = initialize;

// REST methods
exports.agencyRoutes = agencyRoutes;
exports.agencyRouteSchedule = agencyRouteSchedule;
exports.nextAgencyRouteSchedule = nextAgencyRouteSchedule;
exports.routesNearCoordinate = routesNearCoordinate;
exports.agenciesNearCoordinate = agenciesNearCoordinate;
exports.regions = regions;
