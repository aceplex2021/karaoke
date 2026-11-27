const userId = process.argv[2] || '7ef27af2-9b61-4e8b-a8ab-f61fedab634e';
const songId = process.argv[3] || '0595ea2f-a0b4-4e0a-9749-5a5af65b5f32';
const base = process.env.KARA_BASE || 'https://kara2.4voice.ai';

const res = await fetch(`${base}/api/users/${userId}/favorites`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ song_id: songId }),
});
const text = await res.text();
console.log('status', res.status);
console.log(text);
