//setup Dependencies
var connect = require('connect')
    , express = require('express')
    , io = require('socket.io')
    , port = (process.env.PORT || 8081)
    , nextbusapi = require('./nextbusapi')
    , webdir = '/web';

//Setup Express
var server = express.createServer();
server.configure(function(){
    server.set('views', __dirname + '/views');
    server.set('view options', { layout: false });
    //server.use(connect.bodyParser());
    server.use(express.cookieParser());
    server.use(express.session({ secret: "shhhhhhhhh!"}));
    server.use(express.static(__dirname + '/web'));
    server.use(server.router);
});

//Setup Socket.IO
var io = io.listen(server);
io.sockets.on('connection', function(socket){
    console.log('Client Connected');
    socket.on('message', function(data){
        socket.broadcast.emit('server_message',data);
        socket.emit('server_message',data);
    });
    socket.on('disconnect', function(){
        console.log('Client Disconnected.');
    });
});

// Setup database
nextbusapi.initalize();

///////////////////////////////////////////
//              Routes                   //
///////////////////////////////////////////
// API routes that return JSON
server.get('/agency/:agencyid/routes', nextbusapi.agencyRoutes);
server.get('/agency/:agencyid/route/:routeid/schedule', nextbusapi.agencyRouteSchedule);
server.get('/agency/:agencyid/route/:routeid/nextbus', nextbusapi.nextAgencyRouteSchedule);
server.get('/routesnearlat/:lat/lon/:lon/precision/:precision', nextbusapi.routesNearCoordinate);
server.get('/agenciesnearlat/:lat/lon/:lon', nextbusapi.agenciesNearCoordinate);
server.get('/regions', nextbusapi.regions);
server.get('/agency/:agencyid/route/:routeid/prediction', nextbusapi.nextAgencyRoutePrediction);

server.get('/agency/:agency/route/:route/stop/:stop/predictions', nextbusapi.predictions);

// Index route
server.get('/', function(req, res) {
	res.render(__dirname+webdir+'/index.html')
});

server.get('/new', function(req, res) {
	res.render(__dirname+webdir+'/index_old.html')
});


///////////////////////////////////////////
//              Error Routes             //
///////////////////////////////////////////
server.error(function(err, req, res, next){
    if (err instanceof NotFound) {
        res.render('404.jade', { locals: {
            title : '404 - Not Found'
            ,description: ''
            ,author: ''
            ,analyticssiteid: 'XXXXXXX'
        },status: 404 });
    } else {
        res.render('500.jade', { locals: {
            title : 'The Server Encountered an Error'
            ,description: ''
            ,author: ''
            ,analyticssiteid: 'XXXXXXX'
            ,error: err
        },status: 500 });
    }
});

//A Route for Creating a 500 Error (Useful to keep around)
server.get('/500', function(req, res){
    throw new Error('This is a 500 Error');
});

//The 404 Route (ALWAYS Keep this as the last route)
server.get('/*', function(req, res){
    throw new NotFound;
});

function NotFound(msg){
    this.name = 'NotFound';
    Error.call(this, msg);
    Error.captureStackTrace(this, arguments.callee);
}

server.listen(port);

console.log('Listening on http://0.0.0.0:' + port );
