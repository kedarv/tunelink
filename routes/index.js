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

var search = function(slack_username, q_text, callback) {
  var access_token = firebase.database().ref("users/" + slack_username + "/access_token");
  access_token.on("value", function(snapshot) {
    var searchOpts = {
      url: 'https://api.spotify.com/v1/search',
      headers: { 'Authorization': 'Bearer ' + snapshot.val() },
      qs: {
        q: q_text,
        type: "track",
        market: "US",
        limit: "1"
      }
    }
    request.get(searchOpts, function(error, response, body) {
      console.log(error);
      console.log(body);
      var parsed = JSON.parse(body);
      callback(parsed.tracks.items[0].uri);
    });

  }, function (error) {
     console.log("Error: " + error.code);
  });
}

var play = function(slack_username, uri) {
  var access_token = firebase.database().ref("users/" + slack_username + "/access_token");
  access_token.on("value", function(snapshot) {

    var playOpts = {
      url: 'https://api.spotify.com/v1/me/player/play',
      headers: { 'Authorization': 'Bearer ' + snapshot.val() },
      method: 'PUT',
      json: {
        uris: [uri]
      }
    }
    request(playOpts, function(error, response, body) {
      console.log("Playing song for " + slack_username);
    });

  }, function (error) {
     console.log("Error: " + error.code);
  });
}

var playAll = function(uri) {
  var ref = firebase.database().ref("users");

  ref.on("value", function(snapshot) {
    snapshot.forEach(function(child){
      var child_slack_name = child.val().slack_name;
      console.log(child_slack_name)
      play(child_slack_name, uri);
    })
  }, function (error) {
    console.log("Error: " + error.code);
  });
}

var queue = function(uri) {
  var ref = firebase.database().ref("songs/" + Date.now());
  ref.set(uri);
}

/* GET home page. */
router.get('/', function(req, res, next) {
  res.cookie('user', req.query.user);
  res.cookie('id', req.query.id);
  res.render('index', { title: 'Express' });
});

router.post('/request', function(req, res, next) {
  let text = req.body.text;
  var message;
  if(text === "auth") {
    message = "http://localhost:8888?user=" + req.body.user_name + '&id=' + req.body.user_id;
  } else {
    search(req.body.user_name, text, function(uri) {
      console.log("called search from slack: " + uri);
      queue(uri);
    });
  }
  let data = {
    response_type: 'in_channel',
    text: message
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
            // console.log(access_token)
        console.log("USER: ~~~~~~" + req.cookies['user']);
        firebase.database().ref('users/' + req.cookies['user']).set({
          slack_name: req.cookies['user'],
          slack_id: req.cookies['id'],
          access_token:  access_token
        });

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
            limit: "1"
          }
        }
        request.get(searchOpts, function(error, response, body) {
          var parsed = JSON.parse(body);
          console.log(parsed.tracks.items[0].uri)
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
