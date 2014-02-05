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

function doGetSax(host, endpoint, funcs) {

    console.log('doGet(dom):' + host + endpoint);// + ' agency:' + agency + ' route:' + route + ' lat:' + lat + ' lon:' + lon + ' success:' + success);

    var options = {
        host: host,
        port: 80,
        path: endpoint,
        method: 'GET',
        headers: {
            connection: 'keep-alive'
        }
    };

    var p = new libxmljs.SaxParser(funcs);

    var req = http.request(options, function(res) {

        res.setEncoding('utf-8');

        var xml = '';

        res.on('data', function(data) {
            xml += data;
        });

        res.on('end', function() {

            try {
                //console.log('doGet: ' + dom);
               p.parseString(xml);
            } catch (err) {
                console.log('doGet:XML parse error (' + err + ') for ' + host + endpoint);
                console.log('doGet:while parsing:'+ xml);
            }

        });

    });
    req.end();

    req.on('socket', function (socket) {
        socket.setTimeout(1000 * 60 * 2); // Two minute timeout
        socket.setMaxListeners(500);
        socket.on('timeout', function() {
            req.abort();
        });
    });

    req.on('error', function(err) {
        console.log('doGet:HTTP error (' + err + ') for ' + host + endpoint);
    });

}

/**
 * Internal helper operation for executing an HTTP GET
 *
 * @param host
 * @param endpoint
 * @param success
 * @param parser
 */
function doGet(host, endpoint, success) {

    console.log('doGet(dom):' + host + endpoint);// + ' agency:' + agency + ' route:' + route + ' lat:' + lat + ' lon:' + lon + ' success:' + success);

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

function addRouteConfigToDB(agencyTag, agencyTitle, agencyRegionTitle) {

    var endpoint = BASEPATH + '?' + querystring.stringify({command: 'routeConfig', a: agencyTag, terse: ''})

    var map = new HashMap();
    var lat, lon, geoHash;

    doGetSax(HOST, endpoint, {
        startDocument: function() {
            console.log('starting...');
        },
        endDocument: function() {
            console.log('done.');
        },
        startElementNS: function(elem, attrs, prefix, uri, namespaces) {
//            console.log('onStartElementNS:' + elem);
            if(elem == 'route') {
                inRoute = true;
                var geoHash =  geohash.encodeGeoHash(attrs[4][3], attrs[6][3]);
                route = {route: {
                    agencyTitle: agencyTitle,
                    agencytag: agencyTag,
                    region: agencyRegionTitle,
                    routetag: attrs[0][3],
                    title: attrs[1][3],
                    color: attrs[2][3],
                    oppositeColor: attrs[3][3],
                    latmin: attrs[4][3],
                    latmax: attrs[5][3],
                    lonmin: attrs[6][3],
                    lonmax: attrs[7][3],
                    geohash: geoHash,
                    stops: []}
                };
                lat = route.route.latmin; // These are used for the agency
                lon = route.route.lonmin;
                geoHash = geohash.encodeGeoHash(lat, lon)

            } else if (elem == 'stop') {
                //console.log(JSON.stringify(attrs));
                if(attrs.length == 5) {
                    var geoHash = geohash.encodeGeoHash(attrs[2][3], attrs[3][3])
                    var stop = {stop: {tag: attrs[0][3], title:attrs[1][3], lat:attrs[2][3], lon:attrs[3][3], stopId:attrs[4][3], geohash:geoHash}};
                    //console.log(JSON.stringify(stop));
                    route.route.stops.push(stop);
                }
            }
        },
        endElementNS: function(elem, prefix, uri) {
            //console.log('onEndElementNS:' + elem);
            if(elem == 'route') {
                db.insert(route);
                console.log("Add route:" + JSON.stringify(route));
                inRoute = false;
            } else if (elem = 'body') {
                if(!map.has(agencyTag) && (typeof route != 'undefined')) {
                    var agency = {agency: {tag: agencyTag, title: agencyTitle, region: agencyRegionTitle, lat: lat, lon: lon, geohash: route.route.geoHash}}
                    console.log("Add agency:" + JSON.stringify(agency));
                    db.insert(agency);
                    map.set(agencyTag, agencyTag);
                }
            }
        },
        characters: function(chars) {
            //console.log('onCharacters:' + chars);
        },
        cdata: function(chars) {
            //console.log('onCdata:' + chars);
        },
        comment: function(chars) {
            //console.log('onComment:' + chars);
        },
        warning: function(warning) {
            console.warn(warning);
        },
        error: function(error) {
            console.error('ERROR: ' + error);
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
                console.log('regions:key:' + key + ' = ' + JSON.stringify(agency));
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
 * Parse
 *
 * sample: http://localhost:8081/agency/sf-muni/route/N/stop/5205/predictions
 * source sample: http://webservices.nextbus.com/service/publicXMLFeed?command=predictions&a=sf-muni&r=N&s=5205&useShortTitles=false
 *
 * @param request
 * @param response
 */
function predictions(request, response) {
    var endpoint = BASEPATH + '?' + querystring.stringify({command: 'predictions', a: request.params.agency, r: request.params.route, s:request.params.stop});;
    doGet(HOST, endpoint, function(dom) {

        console.log(dom);

        var result = {
            directions: []
        }

        // Run thru the DOM and produce a JSON structure
        var list = dom.find('//predictions/direction');

        for (var i = 0; i < list.length; ++i) {

            console.log('direction:' + JSON.stringify(list[i]));

            var title = list[i].attr('title').value()
            var predictionList = list[i].find('prediction');

            var predictions = [];

            for(var j = 0; j < predictionList.length; ++j) {
                predictions.push({minutes: predictionList[j].attr('minutes').value(), isDeparture: predictionList[j].attr('isDeparture').value()});
            }

            result.directions.push({"direction" : {title : title, predictions: predictions}});
        }

        result.directions.sort(function(a, b) {

            if(a.minutes < b.minutes )
                return -1;
            else if (a.minutes > b.minutes)
                return 1;
            else
                return 0;
        });

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

        var result;
        if(typeof dom != 'undefined') {

            console.log(dom);

            var routeNode = dom.find('//route')[0];

            if(typeof routeNode != 'undefined') {
                result = {
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
        } else {
            result = [];
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

exports.predictions = predictions;

