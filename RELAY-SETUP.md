# Setting up "Go live to YouTube / Facebook"

The app can't send video to YouTube or Facebook by itself. It sends the video to a small
relay (a Cloudflare Worker), and Cloudflare forwards it. You do this setup once.
Everything below can be done in Chrome on a phone (turn on "Desktop site" if a page looks cut off).

## Part A: Cloudflare relay
1. Make a free account at dash.cloudflare.com.
2. In the left menu open **Stream** and turn it on (it is a paid product: check Cloudflare's current Stream pricing and add a payment method).
3. Copy your **Account ID** (shown on the dashboard's right side or in the page address).
4. Create a key: profile icon > **My Profile** > **API Tokens** > **Create Token** > **Create Custom Token**.
   Permission: **Account** > **Stream** > **Edit**. Create it and copy the token (you see it only once).
5. Go to **Workers & Pages** > **Create** > **Create Worker** > name it `ceremonystream-relay` > **Deploy**.
6. Tap **Edit code**, delete everything, paste the whole contents of `relay-worker.js`, tap **Deploy**.
7. Open the Worker > **Settings** > **Variables and Secrets** and add:
   - `CF_ACCOUNT_ID` (Text): your Account ID
   - `CF_API_TOKEN` (Secret): the token from step 4
   - `ALLOWED_ORIGIN` (Text): `https://YOURNAME.github.io` (no path, nothing after .io)
   - `GOOGLE_CLIENT_ID` (Text, optional): your Google Client ID
8. Copy the Worker address, like `https://ceremonystream-relay.yourname.workers.dev`.

## Part B: Put the address in the app
On GitHub edit `index.html` (pencil icon), find `window.CS_RELAY = '';`, put the Worker address
inside the quotes, commit. Then edit `sw.js` and raise the number (`cs-v2` -> `cs-v3`).

## Part C: Accounts
**YouTube**
- The channel must be enabled for live streaming (YouTube Studio > Create > Go live; the first time can take up to 24 hours).
- In Google Cloud Console (same project as your login Client ID): **APIs & Services** > **Library** > enable **YouTube Data API v3**.
- **OAuth consent screen**: add the scope `.../auth/youtube`. While the app is in "Testing", add each person who will stream under **Test users** (max 100). Public use needs Google's verification.

**Facebook (Pages only)**
- Facebook only lets apps go live on a **Page you manage**, not a personal profile.
- In your Facebook app add the permissions `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `publish_video`.
- People who are not admins/testers of your app can use them only after Facebook approves them (App Review), which can take days or weeks.

## Using it
Open the app > Go live > allow camera > tap **Connect YouTube** and/or **Connect Facebook Page** > **Go Live**.
The Go Live button stays locked until at least one account is connected.
