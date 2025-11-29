# 🚀 Deployment Guide - Hostinger VPS

**Your VPS IP:** `31.97.140.232`

This is your complete deployment guide. Follow the steps in order.

---

### STEP 1: Build Your Project (On Your Mac)

Open Terminal on your Mac and run:

```bash
cd /Users/marcjohnson2000/Desktop/YoutubeCryptoBot
npm run build
```

Wait for it to finish. You should see `dist/` and `client/dist/` folders created.

**✅ Done? Continue to Step 2**

---

### STEP 2: Connect to Your VPS

In Terminal, run:

```bash
ssh root@31.97.140.232
```

**If it asks for a password:** Enter your VPS root password (you should have this from Hostinger).

**If you get "Permission denied":** You might need to use a different username. Try:
```bash
ssh ubuntu@31.97.140.232
# or
ssh admin@31.97.140.232
```

**✅ Done? You should now see a different prompt (you're on the VPS)**

---

### STEP 3: Update System

On your VPS, run:

```bash
sudo apt update
sudo apt upgrade -y
```

Wait for it to complete (may take 2-3 minutes).

**✅ Done? Continue**

---

### STEP 4: Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify it worked:
```bash
node --version
npm --version
```

You should see Node.js v20.x.x

**✅ Done? Continue**

---

### STEP 5: Install PM2

```bash
sudo npm install -g pm2
```

Verify:
```bash
pm2 --version
```

**✅ Done? Continue**

---

### STEP 6: Install FFmpeg

```bash
sudo apt install -y ffmpeg
```

Verify:
```bash
ffmpeg -version
```

**✅ Done? Continue**

---

### STEP 7: Install Build Tools

```bash
sudo apt install -y build-essential python3
```

**✅ Done? Continue**

---

### STEP 8: Create App Directory

```bash
sudo mkdir -p /var/www/youtube-crypto-bot
sudo chown -R $USER:$USER /var/www/youtube-crypto-bot
cd /var/www/youtube-crypto-bot
```

**✅ Done? Continue**

---

### STEP 9: Transfer Files from Your Mac

**Open a NEW Terminal window on your Mac** (keep the VPS terminal open).

Run this command (it will copy all files to your VPS):

```bash
cd /Users/marcjohnson2000/Desktop/YoutubeCryptoBot
rsync -avz --progress --exclude 'node_modules' --exclude 'dist' --exclude 'output' --exclude '.git' . root@31.97.140.232:/var/www/youtube-crypto-bot/
```

**If you're not using root user, replace `root` with your username:**
```bash
rsync -avz --progress --exclude 'node_modules' --exclude 'dist' --exclude 'output' --exclude '.git' . ubuntu@31.97.140.232:/var/www/youtube-crypto-bot/
```

Wait for files to transfer (may take 1-2 minutes).

**✅ Done? Go back to your VPS terminal**

---

### STEP 10: Verify Files on VPS

On your VPS terminal:

```bash
cd /var/www/youtube-crypto-bot
ls -la
```

You should see: `package.json`, `src/`, `client/`, etc.

**✅ Done? Continue**

---

### STEP 11: Create .env File on VPS

```bash
nano .env
```

**Now you need to paste your environment variables.**

**On your Mac**, open your `.env` file:
```bash
cat /Users/marcjohnson2000/Desktop/YoutubeCryptoBot/.env
```

**Copy all the content**, then **on your VPS** (in the nano editor):
- Paste the content
- **IMPORTANT:** Update these lines for production:
  ```
  CLIENT_URL=http://31.97.140.232
  YOUTUBE_REDIRECT_URI=http://31.97.140.232/auth/youtube/callback
  NODE_ENV=production
  ```

**Save and exit:**
- Press `Ctrl + X`
- Press `Y`
- Press `Enter`

**✅ Done? Continue**

---

### STEP 12: Install Dependencies

```bash
npm install
```

Wait for it to finish (2-3 minutes).

Then:
```bash
cd client
npm install
cd ..
```

Wait for it to finish.

**✅ Done? Continue**

---

### STEP 13: Build the Project

```bash
npm run build
```

Wait for it to finish (2-3 minutes).

**✅ Done? Continue**

---

### STEP 14: Create Directories

```bash
mkdir -p output logs
chmod 755 output logs
```

**✅ Done? Continue**

---

### STEP 15: Start with PM2

```bash
pm2 start ecosystem.config.js
```

You should see your app listed as "online".

**✅ Done? Continue**

---

### STEP 16: Save PM2 Config

```bash
pm2 save
```

**✅ Done? Continue**

---

### STEP 17: Set Up Auto-Start

```bash
pm2 startup
```

**It will output a command like:**
```
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root
```

**Copy and run that EXACT command** (it will be different for your system).

**✅ Done? Continue**

---

### STEP 18: Check Status

```bash
pm2 status
```

Should show your app as "online".

```bash
pm2 logs youtube-crypto-bot
```

Press `Ctrl + C` to exit. You should see "Server running on http://localhost:3001"

**✅ Done? Continue**

---

### STEP 19: Test

```bash
curl http://localhost:3001/api/health
```

You should get a JSON response.

**✅ Done? Your app is running!**

---

## 🎉 Access Your App

Your app is now accessible at:
- **API:** `http://31.97.140.232:3001`
- **Frontend:** `http://31.97.140.232:3001` (if you set up Nginx)

**Open in browser:** `http://31.97.140.232:3001`

---

## 🔧 Optional: Set Up Nginx (For Better Access)

If you want to access without the port number:

### Install Nginx:
```bash
sudo apt install -y nginx
```

### Create Config:
```bash
sudo nano /etc/nginx/sites-available/youtube-crypto-bot
```

Paste this:
```nginx
server {
    listen 80;
    server_name 31.97.140.232;

    location / {
        root /var/www/youtube-crypto-bot/client/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    location /output {
        alias /var/www/youtube-crypto-bot/output;
    }
}
```

Save (`Ctrl + X`, `Y`, `Enter`)

### Enable:
```bash
sudo ln -s /etc/nginx/sites-available/youtube-crypto-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Now access at: `http://31.97.140.232` (no port needed)

---

## 🆘 Troubleshooting

**Can't connect via SSH?**
- Make sure you have the correct password
- Try different usernames: `root`, `ubuntu`, `admin`

**Build fails?**
- Check: `pm2 logs youtube-crypto-bot --err`
- Make sure all dependencies installed: `npm install`

**App won't start?**
- Check `.env` file has all variables
- Check logs: `pm2 logs youtube-crypto-bot`

**Port not accessible?**
- Check firewall: `sudo ufw allow 3001/tcp`
- Or use Nginx (see above)

---

## ✅ You're Done!

Your app is now:
- ✅ Running on your VPS
- ✅ Auto-restarting on crashes
- ✅ Auto-starting on reboot
- ✅ Accessible at `http://31.97.140.232:3001`

**Next:** Test it in your browser and start the automation!

