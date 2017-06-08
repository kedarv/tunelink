var express = require('express');
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var router = express.Router();

var client_id = '9c907cf58ae1447da90041a93960855a'; // Your client id
var client_secret = '3b45951661b047e3aa3926df20a085dc'; // Your secret
var redirect_uri = 'http://162.243.254.78:8888/callback'; // Your redirect uri

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
var boolcontinue = true;

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
      var parsed = JSON.parse(body);
      callback(parsed);
    });

  }, function (error) {
     console.log("Error: " + error.code);
  });
}

var play = function(slack_username, uri) {
  // refreshToken(slack_username);
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
      if(child.val().active === true){
        var child_slack_name = child.val().slack_name;
        play(child_slack_name, uri);
      }
    })
  }, function (error) {
    console.log("Error: " + error.code);
  });
}

var queue = function(parsed) {
  var ref = firebase.database().ref("songs/" + Date.now());
  var artists = "";
  console.log(parsed);
  parsed.album.artists.forEach(function(element) {
    artists += element.name + " ";
  });
  ref.set({uri: parsed.uri, active: 0, img: parsed.album.images[0].url, songname: parsed.name, artists: artists, duration: parsed.duration_ms});
}

/* GET home page. */
router.get('/', function(req, res, next) {
  if(req.query.user != null && req.query.id != null) {
    res.cookie('user', req.query.user);
    res.cookie('id', req.query.id);
  }
  res.render('index', { title: 'Express' });
});

/* GET dashboard. */
router.get('/dashboard', function(req, res, next) {
  access_tok = req.query.access_token;
  var userOptions = {
    url: 'https://api.spotify.com/v1/me',
    headers: { 'Authorization': 'Bearer ' + access_tok },
    json: true
  };
  var songOptions = {
    url: 'https://api.spotify.com/v1/me/player',
    headers: { 'Authorization': 'Bearer ' + access_tok },
    json: true
  };
  // use the access token to access the Spotify Web API
  request.get(userOptions, function(error, response, body) {
    request.get(songOptions, function(error2, response2, body2) {
      var artists = "";
      body2.item.album.artists.forEach(function(element) {
        artists += element.name + " ";
      });
      res.render('dashboard', {name: body.display_name, artist: artists, img: body2.item.album.images[0].url, song: body2.item.name});
    });
  });
});

router.post('/request', function(req, res, next) {
  let text = req.body.text;
  var message;
  if(text === "auth") {
    message = "http://162.243.254.78:8888?user=" + req.body.user_name + '&id=' + req.body.user_id;
  }
  else if(text === "leave") {
    var current_user = req.body.user_name;
    var users = firebase.database().ref("users").once("value").then(function(snapshot) {
      snapshot.forEach(function(child) {
        if(child.val().slack_name === current_user && child.val().active === true) {
          child.update({active: false});
        }
      })
    });
    message = "You have left the channel.";
  }
  else {
    search(req.body.user_name, text, function(parsed) {
      console.log(parsed);
      console.log("called search from slack: " + parsed.tracks.items[0].uri);
      queue(parsed.tracks.items[0]);
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
  var scope = 'user-read-private user-read-email streaming user-library-read user-modify-playback-state user-read-playback-state';
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

        firebase.database().ref('users/' + req.cookies['user']).set({
          slack_name: req.cookies['user'],
          slack_id: req.cookies['id'],
          active: true,
          access_token:  access_token,
          refresh_token: refresh_token
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

        // we can also pass the token to the browser to make requests from there
        res.redirect('/dashboard?' +
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

function refreshToken(username) {
  var goforward = false;
  var users = firebase.database().ref("users").once("value").then(function(snapshot) {
    snapshot.forEach(function(child) {
      if(child.val().slack_name === username) {
        var authOptions = {
          url: 'https://accounts.spotify.com/api/token',
          headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
          form: {
            grant_type: 'refresh_token',
            refresh_token: child.val().refresh_token
          },
          json: true
        };

        request.post(authOptions, function(error, response, body) {
          if (!error && response.statusCode === 200) {
            var access_token = body.access_token;
            firebase.database().ref('users/' + username).update({
              access_token:  access_token
            });
          }
          goforward = true;
        });
      }
    });
    if(goforward) {
      return true;
    }
  });
}

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
      firebase.database().ref('users/' + req.cookies['user']).update({
        slack_name: req.cookies['user'],
        slack_id: req.cookies['id'],
        active: true,
        access_token:  access_token
      });
      res.send({
        'access_token': access_token
      });
    }
  });
});

// var getTrack = function(callback) {
//   var user = firebase.database().ref("users").once("value").then(function(snapshot) {
//     accesstok = snapshot.val()[Object.keys(snapshot.val())[0]].access_token
//     var getTrackOpts = {
//       url: 'https://api.spotify.com/v1/me/player',
//       headers: { 'Authorization': 'Bearer ' + accesstok },
//     }
//     request.get(getTrackOpts, function(error, response, body) {
//       var parsed = JSON.parse(body);
//       console.log(parsed);
//       callback(parsed.item.duration_ms);
//     });
//   });
// }

// var songqueue = ["spotify:track:6kl1qtQXQsFiIWRBK24Cfp", "spotify:track:7KXjTSCq5nL1LoYtL7XAwS"];
var run = function() {
  var queue = firebase.database().ref("songs").orderByChild('timestamp').on('value', function(snapshot) {
    snapshot.forEach(function(child) {
      uri = child.val().uri;
      key = child.key;
      if(child.val().active == 1 && boolcontinue) {
        firebase.database().ref('songs/' + key + "/active").set(2);
      }
      if (child.val().active == 0 && boolcontinue) {
        boolcontinue = false;
        console.log("calling playAll(" + uri + ")");
        playAll(uri);
        var songduration = child.val().duration;
        console.log('entering callback ' + songduration);
        setTimeout(function() {boolcontinue = true; run();}, songduration);
        firebase.database().ref('songs/' + key + "/active").set(1);
        return true;
      };
    });
  });
  // var track = getTrack(function(duration) {
  //  console.log("in callback " + duration);
 //    console.log(duration);
 //   });
}

run();


module.exports = router;
