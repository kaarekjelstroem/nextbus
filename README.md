# Next Bus

_Next Bus_ is a sample application, which shows bus timetables from http://www.nextbus.com.

The app uses Google Maps API to show the area where a bus route is, Google Geocoding API to get the address of the user,
and the NextBus XML based web services to create JSON based REST services suited for the UI.

## Demo

A running demo is available at http://kaarekjelstroem-nextbus.nodejitsu.com

## Rest services

1. /regions List all regions
2. /agency/[agencytag]/route/[routetag]/nextbus List the upcoming stops for a given route
3. /routesnearlat/[lat]/lon/[lon]/precision/[precision] : Show routes near ([lat], [lon]) with the given geohash precision

## Known bugs

1. When initializing, the app loads regions and routes by calling a set of web services. This causes HTTP timeouts from time to time, and not all routes will therefore load
2. When selecting a route, the app should show all stops and the next time slot when a bus will arrive. This works except when there are no more buses on that day.
3. Various UI related issues
4. The app should have shown the routes on a map, but for some reason the libxmljs parser doesn't return the content of deeply nested nodes. Could rewrite to use SAX instead of DOM, which might fix the issue.

