const express = require('express');
const router = express.Router();
const { getNews, refreshNews } = require('../controllers/newsController');

router.get('/', getNews);
router.post('/refresh', refreshNews);

module.exports = router;