# Next Bus

_Next Bus_ is a sample application, which shows bus timetables from http://www.nextbus.com.

## Demo

A running demo is available at http://kaarekjelstroem-nextbus.nodejitsu.com

## Rest services

/regions

## Known bugs

1) When initializing, the app loads regions and routes by calling a set of web services. This causes HTTP timeouts from time to time, and not all routes will therefore load
2) When selecting a route, the app should show all stops and the next time slot when a bus will arrive. This works except when there are no more buses on that day.
3) Various UI related issues
4) The app should have shown the routes on a map, but for some reason the libxmljs parser doesn't return the content of deeply nested nodes. Could rewrite to use SAX instead of DOM, which might fix the issue.

