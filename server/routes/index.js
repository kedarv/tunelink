var express = require('express');
var router = express.Router();

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

module.exports = router;