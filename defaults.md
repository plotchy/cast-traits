

Welcome
The cast welcomes a new user to farcaster.
(cast) => /\bwelcome\b/i.test(cast.text ?? '') && /@\w+/.test(cast.text ?? '')

Humorous
The cast has a "lol", "haha" or "lmao" in it.

Emoji
The cast has an emoji in it.

Wtf
The cast has a "wtf" in it.

Mentioner
The cast mentions a user.

TIL
The cast is about a topic that the user is learning about.
(cast) => (cast.text ?? '').includes('TIL')

One Word
The cast is a single word.

Longform
The cast has 100 words or more.

11:11 club
The cast has a timestamp that is 11:11.

1:11, 2:22, 3:33, 4:44, 5:55
The hour/minute of the cast timestamp has duplicate digits.

Breakfast club
The cast has a timestamp between 7:00am and 10:30am.
(cast) => { if (!cast.timestamp) return false; const d = new Date(cast.timestamp); if (isNaN(d.getTime())) return false; const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(d); const h = Number(parts.find(p => p.type === 'hour')?.value ?? '-1'); const m = Number(parts.find(p => p.type === 'minute')?.value ?? '-1'); if (h === -1 || m === -1) return false; const totalMinutes = h * 60 + m; return totalMinutes >= 420 && totalMinutes <= 630; }

Midnight
The cast has a timestamp between 12:00am and 12:59am.

Buzzer Beater
The cast has a timestamp with a minute of 59.

Web surfer
The cast contains a URL.
(cast) => /https?:\/\/[^\s]+/.test(cast.text ?? '') || cast.embeds?.some(e => 'url' in e) === true

Questioner
The cast contains a question mark.
(cast) => (cast.text ?? '').includes('?')

Liked
The cast has 100 or more likes.

Viral
The cast has 1000 or more likes.

Reply'd guy
The cast has 10 or more replies.

Thought provoking
The cast has 100 or more replies.

gm
The cast contains a "gm" word in it.

Quote
The cast contains an embedded cast in it.

Music
The cast contains a link to spotify or apple music.

