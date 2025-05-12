const express = require('express');
const Fuse = require('fuse.js');
const fs = require('fs');
const informasi = JSON.parse(fs.readFileSync('./informasi', 'utf-8'));
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Ubah ke format untuk Fuse
const fuseItems = informasi.flatMap(item =>
  item.aliases.map(alias => ({
    keyword: alias,
    item
  }))
);

// Setup Fuse
const fuse = new Fuse(fuseItems, {
  keys: ['keyword'],
  threshold: 0.3,
  includeScore: true
});

app.get('/api/ask', (req, res) => {
  const question = req.query.question?.toLowerCase();
  if (!question) return res.status(400).json({ error: 'Parameter ?question= wajib' });

  const result = fuse.search(question);
  if (result.length > 0 && result[0].score < 0.5) {
    const top = result[0].item.item;
    const answer = top.answers[Math.floor(Math.random() * top.answers.length)];
    return res.json({
      question,
      answer,
      matched: result[0].item.keyword,
      id: top.id,
      title: top.title,
      description: top.description,
      type: top.type,
      tags: top.tags,
      references: top.references,
      score: result[0].score,
    });
  }

  // Jika tidak ada match
  const suggestions = fuseItems
    .filter(x => question.includes(x.keyword))
    .map(x => x.keyword);

  return res.json({
    question,
    answer: 'Maaf, saya belum tahu jawabannya.',
    matched: null,
    suggestions: [...new Set(suggestions)],
    references: [],
    score: null
  });
});

module.exports = app;
