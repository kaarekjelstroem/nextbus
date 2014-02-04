var app = app || {};

/**
 * Get the current geo coordinates of the user, and invoke done() when finished.
 *
 * @param done
 */
app.initLocation = function(done) {

    // Default location
    app.latitude = 37.7860099;
    app.longitude = -122.4025387;
    app.orig_latitude = app.latitude;
    app.orig_longitude = app.longitude;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                app.latitude = position.coords.latitude;
                app.longitude = position.coords.longitude;

                app.orig_latitude = app.latitude;
                app.orig_longitude = app.longitude;

                done();
            },
            function(error) {
                console.log("Unable to get location:" + error + ". Fall back to center of the universe.");
                done();
            }
        );
    } else {
        console.log('No geolocation information available. Fall back to center of the universe.');
        done();
    }
}
