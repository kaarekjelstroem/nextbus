/**
 * Controller logic to handle backbone views and model
 */

var app = app || {};

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
        this.scheduleView.clear();
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
        this.scheduleView.clear();
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
        this.url = '/routesnearlat/' + lat + '/lon/' + lon + '/precision/4';
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
            app.agency = agencyRoute[0];
            app.route = agencyRoute[1];
            app.latitude = agencyRoute[2];
            app.longitude = agencyRoute[3];

            map.setCenter(new google.maps.LatLng(app.latitude,app.longitude), 30)
            map.setZoom(16);

            this.scheduleView.refresh();
        }
    },
    initialize: function () {
        this.listenTo(this.model,'change', this.render);
        this.model.fetch();
    },
    render: function () {
        console.log(JSON.stringify(this.model.attributes));

        var template = _.template($('#route-template').html(), { routes: this.model.attributes });
        this.$el.html(template);

        /*
        // Make sure we have an agency and a route!
        if(typeof app.agency == "undefined") {
            var agencyRoute = this.$('#route-selector').val().split(':');
            app.agency = agencyRoute[0];
            app.route = agencyRoute[1];
            console.log("Init agency, route:" + app.agency + "," + app.route);
        } else {
            console.log("App.agency defined:" + app.agency);
        }


        this.scheduleView.refresh();
        */

        return this;
    },
    refresh: function () {
        this.model.updateUrl(app.latitude, app.longitude);
        this.model.clear();
        this.model.fetch();
    }
});

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

            initGoogleMaps(app.latitude, app.longitude);

            var addressModel = new app.AddressModel();
            var addressView = new app.AddressView({ model: addressModel });

            var districtModel = new app.DistrictModel();
            var districtView = new app.DistrictView({ model: districtModel });

            var routesModel = new app.RoutesModel();
            var routesView = new app.RoutesView({ model: routesModel });

            districtView.routesView = routesView;

            var scheduleModel = new app.ScheduleModel();
            var scheduleView = new app.ScheduleView({ model: scheduleModel });

            routesView.scheduleView = scheduleView;
            districtView.scheduleView = scheduleView;
            addressView.scheduleView = scheduleView;

            console.log("DONE!!");
        })

        Backbone.history.start();
    })
})