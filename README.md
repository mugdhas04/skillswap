# SkillSwap

SkillSwap is a modern skill-exchange web app where users can:
- Create a profile with skills they can teach and want to learn
- Find reciprocal matches
- Send, accept, decline, or remove swap requests
- Chat with matched users
- See dashboard analytics
- Add dynamic custom skills that become reusable options

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Data/Auth: Supabase (with local fallback mode)
- Hosting: Vercel (static deployment)

## Project Structure

- `index.html` - Landing page
- `signup.html` - Sign up flow
- `login.html` - Login flow
- `dashboard.html` - Matches and analytics
- `my-requests.html` - Request management
- `profile.html` - Profile and updates
- `chat.html` - Messaging
- `script.js` - App logic and data layer
- `style.css` - UI styling
- `supabase-schema.sql` - Database schema and RLS policies
- `supabase-config.js` - Runtime Supabase config
- `supabase-config.example.js` - Config template

## 1. Run Locally

### Option A: Quick local server (recommended)

1. Open terminal in project folder.
2. Run:

```bash
python -m http.server 8000
```

3. Open:

```text
http://localhost:8000
```

## 2. Configure Supabase (Live Database Mode)

If `supabase-config.js` has empty values, app runs in local mode.

### Create Supabase project

1. Create a project in Supabase.
2. Go to Settings > API.
3. Copy:
- Project URL
- anon public key

### Apply database schema

1. Open Supabase SQL Editor.
2. Paste contents of `supabase-schema.sql`.
3. Run it.

### Set runtime config

Edit `supabase-config.js`:

```javascript
window.SKILLSWAP_SUPABASE = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

4. Refresh the app.

## 3. Dynamic Skills (Global)

Custom skills entered in signup/profile are:
- Stored for dropdown reuse
- Synced to global `skill_catalog` when Supabase mode is active
- Available to other users after refresh

## 4. Request Behavior Rules

- Incoming request options: Accept, Decline, Remove
- If accepted, reverse request is blocked for that pair
- If declined or removed, either side can request again later

## 5. Deploy to Vercel

### CLI deploy

1. Login:

```bash
npx vercel login
```

2. Deploy production:

```bash
npx vercel --prod --yes
```

### GitHub + Vercel dashboard deploy

1. Push code to GitHub.
2. Import repository in Vercel dashboard.
3. Deploy.

This project is static, so no build step is required.

## 6. Git Workflow

Typical flow:

```bash
git add .
git commit -m "your message"
git push
```

## 7. Troubleshooting

- App redirects to login unexpectedly:
  - Confirm active session or sign in again.
- Signup error with rate limits:
  - Use local mode temporarily (empty values in `supabase-config.js`) or wait for Supabase cooldown.
- Skills not appearing globally:
  - Confirm `skill_catalog` table exists and schema was re-run.
- Data not persisting:
  - Verify `supabase-config.js` URL/key are correct.

## License

Personal/educational project.
