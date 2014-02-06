/**
 * Controller logic to handle backbone views and model
 */

var map = map || {};
var app = app || {};

var gmap_busstopmarkers = [];

var opts = {
  lines: 13, // The number of lines to draw
  length: 20, // The length of each line
  width: 10, // The line thickness
  radius: 30, // The radius of the inner circle
  corners: 1, // Corner roundness (0..1)
  rotate: 0, // The rotation offset
  direction: 1, // 1: clockwise, -1: counterclockwise
  color: '#000', // #rgb or #rrggbb or array of colors
  speed: 1, // Rounds per second
  trail: 60, // Afterglow percentage
  shadow: false, // Whether to render a shadow
  hwaccel: false, // Whether to use hardware acceleration
  className: 'spinner', // The CSS class to assign to the spinner
  zIndex: 2e9, // The z-index (defaults to 2000000000)
  top: 'auto', // Top position relative to parent in px
  left: 'auto' // Left position relative to parent in px
};
var target = document.getElementById('container');
var spinner = new Spinner(opts).spin(target);

function initGoogleMaps(latitude, longitude) {
    console.log('Loading map');
    var latLng = new google.maps.LatLng(latitude, longitude);
    var mapOptions = {
           center: latLng,
           zoom: 16
    };
    map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);
    var marker = new google.maps.Marker({
         position: latLng,
         map: map,
         title: 'You are here!'
    });
 }

// Model for getting the current address from Google Geocode APIs
app.AddressModel = Backbone.Model.extend({
    initialize: function() {
        this.updateUrl(app.latitude, app.longitude);
    },

    updateUrl: function(lat, lon) {
        this.url = 'http://maps.googleapis.com/maps/api/geocode/json?latlng=' + lat + ',' + lon + '&sensor=false';
    },

    url: ''
});

// View for setting the current address
app.AddressView = Backbone.View.extend({
    el: '.tmpl-address',

    events: {
        "click .homebutton": "clickhome",
    },
    clickhome: function() {
        console.log("clickhome");
        //this.scheduleView.clear();
        initGoogleMaps(app.orig_latitude, app.orig_longitude);
    },
    initialize: function () {
        this.listenTo(this.model,'change', this.render);
        this.model.fetch();
    },

    render: function () {
        var address = this.model.attributes.results[0].formatted_address;
        console.log(address);
        var template = _.template($('#address-template').html(), {address: address});
        this.$el.html(template);
    }
});

// Model for getting the the list of districts
app.DistrictModel = Backbone.Model.extend({
    url: '/regions'
});

// View for setting the districts
app.DistrictView = Backbone.View.extend({
    el: '.tmpl-district-select',
    events: {
        "change #district-selector": "districtSelected"
    },
    districtSelected: function() {
        var latLng = this.$('#district-selector').val().split(',');
        app.latitude = latLng[0], app.longitude = latLng[1];

        map.setCenter(new google.maps.LatLng(app.latitude,
                                             app.longitude), 30)
        map.setZoom(10);

        this.routesView.refresh();
        //this.stopsView.clear();
    },
    initialize: function () {
        this.listenTo(this.model,'change', this.render);
        this.model.fetch();
    },
    render: function () {
        console.log(JSON.stringify(this.model.attributes));
        var template = _.template($('#district-template').html(),
               {
                   districts: this.model.attributes,
                   seldistrict: ''
               });
        this.$el.html(template);

        return this;
   }
});

app.RoutesModel = Backbone.Model.extend({
    initialize: function() {
        this.updateUrl(app.latitude, app.longitude);
    },
    updateUrl: function(lat, lon) {
        console.log("Coords:" + lat + "," + lon);
        this.url = '/routesnearlat/' + lat + '/lon/' + lon + '/precision/3';
        console.log('RoutesModel.url = ' + this.url);
    },
    url: ''
});

// View for setting the routes for a district
app.RoutesView = Backbone.View.extend({
    el: '.tmpl-routes-select',
    events: {
        "change #route-selector": "routeSelected"
    },
    routeSelected: function() {
        // When -- select route -- is chosen, do nothing
        if(this.$('#route-selector').val() != '-') {
            var agencyRoute = this.$('#route-selector').val().split(':');
            app.index = agencyRoute[0];
            app.agency = agencyRoute[1];
            app.route = agencyRoute[2];
            app.latitude = agencyRoute[3];
            app.longitude = agencyRoute[4];

            map.setCenter(new google.maps.LatLng(app.latitude,app.longitude), 30)
            map.setZoom(16);

            console.log("routeSelected:" + JSON.stringify(this.model.attributes));

            var bounds = new google.maps.LatLngBounds();

            gmap_ClearAllMarkers();

            if(typeof this.model.attributes != 'undefined') {
                var stops = this.model.attributes[app.index].route.stops;
                console.log("drawing route::" + JSON.stringify(this.model.attributes[0]));

                for(i = 0 ; i < stops.length; i++) {

                    var latLng = new google.maps.LatLng(stops[i].stop.lat, stops[i].stop.lon);
                    var marker = new google.maps.Marker({
                             position: latLng,
                             map: map,
                             title: stops[i].stop.title
                        });

                    gmap_busstopmarkers.push(marker);

                    bounds.extend(latLng);
                }
                map.fitBounds(bounds);
            }

            this.stopsView.refresh(app.index);
        }
    },
    initialize: function () {
        this.listenTo(this.model, 'change', this.render);
        this.model.fetch();
    },
    render: function () {
        console.log('RoutesModel: ' + JSON.stringify(this.model.attributes));
        var template = _.template($('#route-template').html(), { routes: this.model.attributes });
        this.$el.html(template);

        return this;
    },
    refresh: function () {
        this.model.updateUrl(app.latitude, app.longitude);
        this.model.clear();
        this.model.fetch();
        this.stopsView.model = this.model;
    }
});

/*
// Schedule
app.ScheduleModel = Backbone.Model.extend({
    initialize: function() {
        this.updateUrl(app.agency, app.route);
    },
    updateUrl: function(agency, route) {
        this.url = '/agency/' + agency + '/route/' + route + '/nextbus';
        console.log("Schedules.updateUrl:" + this.url);
    },
    url: ''
});

// View for showing the next schedule for a given route
app.ScheduleView = Backbone.View.extend({
    el: '.tmp-schedule-table',
    initialize: function () {
        this.listenTo(this.model,'change', this.render);
    },
    render: function () {
        console.log(JSON.stringify(this.model.attributes));

        var template = _.template($('#schedule-template').html(),{ schedules: this.model.attributes });
        this.$el.html(template);
        return this;
    },
    refresh: function () {
        this.model.updateUrl(app.agency, app.route);
        this.model.clear();
        this.model.fetch();
    },
    clear: function() {
        var template = _.template($('#schedule-template').html(),{ schedules: [] });
        this.$el.html(template);
        return this;
    }
});
*/

// View for setting the routes for a district
app.StopsView = Backbone.View.extend({
    el: '.tmpl-stops-select',
    events: {
        "change #stop-selector": "stopSelected"
    },
    stopSelected: function() {
        var stopSelector = this.$('#stop-selector').val();
        app.stop = stopSelector;
        console.log('app.stop = ' + app.stop);
        this.predictionsView.refresh();
    },
    initialize: function () {
        this.listenTo(this.model,'change', this.render);
        //this.model.fetch();
    },
    render: function () {
        console.log(JSON.stringify("app.stopsView.render:" + this.model.attributes));
        // When -- select route -- is chosen, do nothing
        console.log("INDEX:" + this.index);
        if(typeof this.model.attributes[this.index] != 'undefined') {

            var template = _.template($('#stop-template').html(), { stops: this.model.attributes[this.index].route.stops });
            this.$el.html(template);
        }

        return this;
    },
    refresh: function (index) {
        console.log("stopsView.refresh:" + index);
        this.index = index;
        this.render();
    },
    clear: function() {
        console.log('TODO: Clear list!!');
    }
});

// Predictions
app.PredictionModel = Backbone.Model.extend({
    initialize: function() {
        this.updateUrl(app.agency, app.route, app.stop);
    },
    updateUrl: function(agency, route, stop) {
        this.url = '/agency/' + agency + '/route/' + route + '/stop/' + stop + '/predictions';
        console.log("PredictionModel.updateUrl:" + this.url);
    },
    url: ''
});

// View for showing the next schedule for a given route
app.PredictionView = Backbone.View.extend({
    el: '.tmpl-stop-prediction',
    initialize: function () {
        this.listenTo(this.model,'change', this.render);
    },
    render: function () {
        console.log('PredictionView.render');
        var template = _.template($('#prediction-template').html(),{ predictions: this.model.attributes });
        console.log('PredictionView.done-render');
        this.$el.html(template);
        return this;
    },
    refresh: function () {
        this.model.updateUrl(app.agency, app.route, app.stop);
        this.model.clear();
        this.model.fetch();
    },
    clear: function() {
        var template = _.template($('#prediction-template').html(),{ predictions: [] });
        this.$el.html(template);
        return this;
    }
});


var Router = Backbone.Router.extend({
    routes : {
        '' : 'home'
    }
});

 // We need to know the location before we can do anything
$(document).ready(function(){
    app.initLocation(function() {
        var router = new Router();
        router.on('route:home', function () {

            console.log("STARTING APP!!");

            initGoogleMaps(app.latitude, app.longitude);

            var addressModel = new app.AddressModel();
            var addressView = new app.AddressView({ model: addressModel });

            console.log("STARTING APP!Adresss");

            var districtModel = new app.DistrictModel();
            var districtView = new app.DistrictView({ model: districtModel });

            console.log("STARTING APP!District");

            var routesModel = new app.RoutesModel();
            var routesView = new app.RoutesView({ model: routesModel });

            console.log("STARTING APP!Routes");

            districtView.routesView = routesView;

            //var scheduleModel = new app.ScheduleModel();
            //var scheduleView = new app.ScheduleView({ model: scheduleModel });

            //routesView.scheduleView = scheduleView;
            //districtView.scheduleView = scheduleView;
            //addressView.scheduleView = scheduleView;

            var stopsView = new app.StopsView({model: routesModel});

            routesView.stopsView = stopsView;

            var predictionsModel = new app.PredictionModel();
            var predictionsView = new app.PredictionView({ model: predictionsModel });

            stopsView.predictionsView = predictionsView;

            console.log("BEFORE DONE");
            console.log("routeView.stopsView:" + routesView.stopsView);

            console.log("DONE!!");

            spinner.stop();

        })

        Backbone.history.start();
    })
})

function gmap_ClearAllMarkers() {
    for (var i = 0; i < gmap_busstopmarkers.length; i++) {
        gmap_busstopmarkers[i].setMap(null);
    }
    gmap_busstopmarkers = [];
}

