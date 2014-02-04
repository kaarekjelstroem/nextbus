/**
 * REST API that connects to the public Next Bus API (XML) and returns JSON structures
 *
 * Created by kaarek on 28/01/14.
 */
var HashMap = require('hashmap').HashMap;
var Datastore = require('nedb')
  , db = new Datastore();

var geohash = require("./geohash").GeoHash;

var querystring = require('querystring');
var http = require('http');
var libxmljs = require('libxmljs');

var HOST = 'webservices.nextbus.com';
var BASEPATH = '/service/publicXMLFeed';

/**
 * Internal helper operation for executing an HTTP GET
 *
 * @param host
 * @param endpoint
 * @param success
 */
function doGet(host, endpoint, success) {

    console.log('doGet:' + host + endpoint);// + ' agency:' + agency + ' route:' + route + ' lat:' + lat + ' lon:' + lon + ' success:' + success);

    var options = {
        host: host,
        port: 80,
        path: endpoint,
        method: 'GET',
        headers: {
            connection: 'keep-alive'
        }
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

            try {
                var dom = libxmljs.parseXml(xml);

                //console.log('doGet: ' + dom);
                success(dom);
            } catch (err) {
                console.log('doGet:XML parse error (' + err + ') for ' + host + endpoint);
                console.log('doGet:while parsing:'+ xml);
            }

        });
    });
    req.end();

    req.on('socket', function (socket) {
        socket.setTimeout(1000 * 60 * 2); // Two minute timeout
        socket.on('timeout', function() {
            req.abort();
        });
    });

    req.on('error', function(err) {
        console.log('doGet:HTTP error (' + err + ') for ' + host + endpoint);
    });
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
    var endpoint3 = BASEPATH + '?' + querystring.stringify({command: 'routeConfig', a: agencyTag, terse: ''})

    //console.log('endpoint3:' + endpoint3);

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

            // TODO: Not working. The list of stop elements is populated, but the stop elements are alle empty?!
            /*
            console.log(routeNodeList[i].find('stop')[0].title);

            var stopNodeList = dom3.find('//route/stop');

            for(var j = 0; j < stopNodeList.length; j++) {
                //console.log("Stop.tag" + stopNodeList[j].tag);
                //console.log("Stop:" + JSON.stringify(stopNodeList[j]));
            }

            //db.insert({route: {agencyTitle: agencyTitle, agencytag: agencyTag, region: agencyRegionTitle, routetag: routeTag, title: routeTitle, latmin: latMin, latmax: latMax, lonmin: lonMin, lonmax: lonMax, geohash: geoHash, stops: stopNodeList}});
            */

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

    console.log("routesNearCoordinate:Looking for geohash:" + geoHash + ' short:' + geoHashTruncate);

    var top = geohash.calculateAdjacent(geoHash, 'top');
    var bottom = geohash.calculateAdjacent(geoHash, 'bottom');
   	var right = geohash.calculateAdjacent(geoHash, 'right');
   	var left = geohash.calculateAdjacent(geoHash, 'left');
    var topleft = geohash.calculateAdjacent(left, 'top');
   	var topright = geohash.calculateAdjacent(right, 'top');
   	var bottomright = geohash.calculateAdjacent(right, 'bottom');
   	var bottomleft = geohash.calculateAdjacent(left, 'bottom');

    console.log('routesNearCoordinate:top=' + top + ',' + bottom + ',' + left+ ',' + right+ ',' + topleft + ',' + topright + ',' + bottomleft+ ',' + bottomright+ ',')

    top = top.substring(0, precision);
    bottom = bottom.substring(0, precision);
    right = right.substring(0, precision);
    left = left.substring(0, precision);
    topleft = topleft.substring(0, precision);
    topright = topright.substring(0, precision);
    bottomleft = bottomleft.substring(0, precision);
    bottomright = bottomright.substring(0, precision);

    // Find all routes whose geohashes begin with one of the 9 prefixes (are close by)
    var geoHashList = [
        {"route.geohash": new RegExp('^' + geoHashTruncate + '(.*)$')},
        {"route.geohash": new RegExp('^' + top + '(.*)$')},
        {"route.geohash": new RegExp('^' + bottom + '(.*)$')},
        {"route.geohash": new RegExp('^' + right + '(.*)$')},
        {"route.geohash": new RegExp('^' + left + '(.*)$')},
        {"route.geohash": new RegExp('^' + topleft + '(.*)$')},
        {"route.geohash": new RegExp('^' + topright + '(.*)$')},
        {"route.geohash": new RegExp('^' + bottomright + '(.*)$')},
        {"route.geohash": new RegExp('^' + bottomleft + '(.*)$')}];

    console.log("routesNearCoordinate:Hash:" + geoHashTruncate + ',' + top + ',' + bottom + ',' + right + ',' + left + ',' + topleft + ',' + topright + ',' + bottomleft + ',' + bottomright);

    db.find({$or: geoHashList}, function (err, docs) {

        console.log('routesNearCoordinate:' + JSON.stringify(docs));

        docs.sort(function(routeA, routeB) {

            if(routeA.route.title < routeB.route.title )
                return -1;
            else if (routeA.route.title > routeB.route.title)
                return 1;
            else
                return 0;
        });

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

        docs.sort(function(agencyA, agencyB) {
            if(agencyA.title < agencyB.title )
                return -1;
            else if (agencyA.title > agencyB.title)
                return 1;
            else
                return 0;
        });

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

        result.sort(function(regionA, regionB) {
            if(regionA.region < regionB.region )
                return -1;
            else if (regionA.region > regionB.region)
                return 1;
            else
                return 0;
        });

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
                var title = routeHeaderStopNodeList[i].text();

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

                    console.log("agencyRouteSchedule:" + tag + '=' + title);

                    result.route.schedule.push({"stop" : {"tag:" : tag, "title" : title}});

                }
            }
        }

        response.send(JSON.stringify(result));
    });
}

function nextAgencyRoutePrediction(request, response) {

    db.find({'route.routetag': request.params.routeid}, function (err, docs) {

        if(docs.length > 0) {
            var stops = docs[0].route.stops;
            var routeTag = docs[0].route.routetag;
            var tagList = '';

            for(var i = 0; i < stops.length; i++) {
                console.log(JSON.stringify(stops[i]));
                var tag = routeTag +'|' + stops[i].tag;
                if(i < stops.length)
                    tag = tag + ',';
                tagList = tagList + tag;
            }

            var endpoint = BASEPATH + '?' + querystring.stringify({command: 'predictions', a: request.params.agencyid, r: request.params.routeid, stops: tagList});

            console.log(endpoint);
        }

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
            var stopsNodeList = dom.find('//tr/stop');
            var now = new Date();

            console.log('StopsNodeList:' + JSON.stringify(stopsNodeList));

            for(var s = 0; s < stopsNodeList.length; ++s) {

                var tag = stopsNodeList[s].attr('tag').value();
                var title = titleMap.get(tag);
                var time = stopsNodeList[s].text().split(':');
                var epochTime = stopsNodeList[s].attr('epochTime').value();
                console.log('epochTime:' + epochTime);

                // The stop is not served if epochTime == -1
                if(epochTime != '-1') {

                    var date = new Date();
                    date.setHours(time[0]);
                    date.setMinutes(time[1]);
                    date.setSeconds(time[2]);

                    console.log("Compare dates:" + date + ':' + now + ' == ' + (now < date));

                    if((now < date) && !tagMap.has(tag)) {

                        //console.log('add: ' + tag + '=' + title + ', time:' + time);

                        tagMap.set(tag, tag);

                        result.route.schedule.push({"stop" : {"tag:" : tag, "title" : title, "time" : time}});
                    }
                }
            }
        }

        result.route.schedule.sort(function(stopA, stopB) {

            console.log('docs.sort.compare(' + stopA.stop.time+ ' <> ' + stopB.stop.time + ')');
            if(stopA.stop.time < stopB.stop.time )
                return -1;
            else if (stopA.stop.time > stopB.stop.time)
                return 1;
            else
                return 0;
        });

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
exports.nextAgencyRoutePrediction = nextAgencyRoutePrediction;
