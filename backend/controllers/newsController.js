const NewsEvent = require('../models/NewsEvent');
const scrapeForexFactory = require('../services/scraper');

// @desc    获取本周所有新闻
// @route   GET /api/news
// @access  Public
const getNews = async (req, res) => {
  try {
    // 按时间正序排列
    const news = await NewsEvent.find({}).sort({ date: 1 });
    res.json(news);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    强制刷新新闻数据 (爬虫)
// @route   POST /api/news/refresh
// @access  Private (暂时公开用于测试)
const refreshNews = async (req, res) => {
  try {
    await scrapeForexFactory();
    res.json({ message: 'News data refreshed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Scraping failed', error: error.message });
  }
};

module.exports = { getNews, refreshNews };