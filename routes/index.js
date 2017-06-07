var express = require('express');
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var router = express.Router();

var client_id = '9c907cf58ae1447da90041a93960855a'; // Your client id
var client_secret = '3b45951661b047e3aa3926df20a085dc'; // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

var firebase = require('firebase');
var config = {
  apiKey: "AIzaSyA0_mdwrZcBaH8lCGhj3jjxgJD8VmoQAiE",
  authDomain: "tunelink-e22a0.firebaseapp.com",
  databaseURL: "https://tunelink-e22a0.firebaseio.com",
  projectId: "tunelink-e22a0",
  storageBucket: "tunelink-e22a0.appspot.com",
  messagingSenderId: "31953235674"
};
firebase.initializeApp(config);

var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var searchAndPlay = function() {
  var userId = firebase.auth().currentUser.uid;
  return firebase.database().ref('/users/' + userId).once('value').then(function(snapshot) {
    var username = snapshot.val().username;
    // ...
  });
  
  var searchOpts = {
    url: 'https://api.spotify.com/v1/search',
    headers: { 'Authorization': 'Bearer ' + access_token },
    qs: {
      q: "Humble",
      type: "track",
      market: "US",
      limit: "10"
    }
  }
  request.get(searchOpts, function(error, response, body) {
    var song_to_play = data.body.tracks.items.first;
    console.log(song_to_play);
  });

  var playOpts = {
    url: 'https://api.spotify.com/v1/me/player/play',
    headers: { 'Authorization': 'Bearer ' + access_token },
    method: 'PUT',
    json: {
      context_uri: "spotify:album:5ht7ItJgpBH7W6vJ5BqpPr",
      offset: {position: 5}
    }
  }
  request(playOpts, function(error, response, body) {
    console.log(body);
  });


}

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/request', function(req, res, next) {
  let text = req.body.text;
  let data = {
    response_type: 'in_channel',
    text: 'API hit, text: ' + text,
  };
  res.json(data);
});

router.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email streaming user-library-read user-modify-playback-state';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

router.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {
        var access_token = body.access_token,
            refresh_token = body.refresh_token;
            console.log(access_token)
        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
        });

        var searchOpts = {
          url: 'https://api.spotify.com/v1/search',
          headers: { 'Authorization': 'Bearer ' + access_token },
          qs: {
            q: "Humble",
            type: "track",
            market: "US",
            limit: "10"
          }
        }
        request.get(searchOpts, function(error, response, body) {
          console.log("*******");
          console.log(response.body.tracks);
        });


        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

router.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

module.exports = router;