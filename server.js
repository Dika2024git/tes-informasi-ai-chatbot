const express = require('express');
const Fuse = require('fuse.js');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
// Impor axios untuk membuat permintaan HTTP langsung
const axios = require('axios');

const filePath = path.join(__dirname, 'informasi.json');
const informasi = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

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

// Endpoint API Wikipedia Bahasa Indonesia
const WIKIPEDIA_API_ENDPOINT = 'https://id.wikipedia.org/w/api.php';

// Mengubah handler menjadi async untuk menggunakan await
app.get('/api/ask', async (req, res) => {
  const question = req.query.question?.toLowerCase();
  if (!question) {
    return res.status(400).json({ error: 'Parameter ?question= wajib' });
  }

  // --- LOGIKA 1: PENCARIAN LOKAL DENGAN FUSE.JS ---
  const localResult = fuse.search(question);
  if (localResult.length > 0 && localResult[0].score < 0.5) {
    const top = localResult[0].item.item;
    const answer = top.answers[Math.floor(Math.random() * top.answers.length)];
    console.log(`Jawaban ditemukan di lokal untuk: "${question}"`);
    return res.json({
      question,
      answer,
      source: 'local',
      matched: localResult[0].item.keyword,
      id: top.id,
      title: top.title,
      score: localResult[0].score,
    });
  }

  // --- LOGIKA 2: FALLBACK PENCARIAN KE WIKIPEDIA API LANGSUNG ---
  console.log(`Tidak ditemukan di lokal, mencoba mencari di Wikipedia API untuk: "${question}"`);
  try {
    // LANGKAH A: Cari judul artikel yang relevan
    const searchParams = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: question,
        format: 'json',
        srlimit: 1 // Ambil 1 hasil teratas saja
    });
    
    const searchResponse = await axios.get(`${WIKIPEDIA_API_ENDPOINT}?${searchParams}`);
    const searchResults = searchResponse.data.query.search;

    if (searchResults.length === 0) {
      throw new Error(`Tidak ada hasil pencarian di Wikipedia untuk "${question}"`);
    }

    const articleTitle = searchResults[0].title;

    // LANGKAH B: Ambil ringkasan (extract) dari artikel yang ditemukan
    const extractParams = new URLSearchParams({
        action: 'query',
        prop: 'extracts',
        exintro: true,      // Hanya ambil bagian intro/ringkasan
        explaintext: true,  // Ambil dalam format teks biasa (bukan HTML)
        titles: articleTitle,
        format: 'json',
        redirects: 1        // Ikuti pengalihan (redirects) secara otomatis
    });

    const extractResponse = await axios.get(`${WIKIPEDIA_API_ENDPOINT}?${extractParams}`);
    const pages = extractResponse.data.query.pages;
    const pageId = Object.keys(pages)[0]; // Ambil ID halaman dari respons
    const summary = pages[pageId].extract;

    if (!summary || summary.length < 20) {
        throw new Error('Ringkasan Wikipedia tidak ditemukan atau tidak informatif.');
    }

    const pageUrl = `https://id.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`;
    console.log(`Jawaban ditemukan di Wikipedia: "${articleTitle}"`);

    return res.json({
      question,
      answer: summary,
      source: 'wikipedia',
      matched: articleTitle,
      references: [pageUrl],
      score: null
    });

  } catch (error) {
    // --- LOGIKA 3: JAWABAN DEFAULT JIKA SEMUA GAGAL ---
    console.error(`Error saat mengakses Wikipedia API:`, error.message);
    return res.json({
      question,
      answer: 'Maaf, saya belum tahu jawabannya.',
      source: 'none',
      matched: null,
      references: [],
      score: null
    });
  }
});

module.exports = app;