import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  app.post('/api/lookup', async (req, res) => {
    try {
      const { usernames } = req.body;
      if (!Array.isArray(usernames)) {
        return res.status(400).json({ error: 'usernames must be an array' });
      }

      // Step 1: Resolve usernames to IDs
      const userRes = await axios.post('https://users.roblox.com/v1/usernames/users', {
        usernames,
        excludeBannedUsers: false,
      });

      const usersData = userRes.data.data; // Array of { requestedUsername, id, name, displayName }
      const results = [];

      for (const reqUsername of usernames) {
        const foundUser = usersData.find((u: any) => u.requestedUsername.toLowerCase() === reqUsername.toLowerCase());
        
        if (!foundUser) {
          results.push({ username: reqUsername, status: 'NOT_FOUND' });
          continue;
        }

        const userId = foundUser.id;

        try {
          // Fetch details concurrently
          const [
            profileRes,
            friendsRes,
            followersRes,
            groupsRes,
            badgesRes,
            thumbnailRes
          ] = await Promise.allSettled([
            axios.get(`https://users.roblox.com/v1/users/${userId}`),
            axios.get(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
            axios.get(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
            axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`),
            axios.get(`https://accountinformation.roblox.com/v1/users/${userId}/roblox-badges`),
            axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`)
          ]);

          const profile = profileRes.status === 'fulfilled' ? profileRes.value.data : {};
          const friends = friendsRes.status === 'fulfilled' ? friendsRes.value.data.count : 0;
          const followers = followersRes.status === 'fulfilled' ? followersRes.value.data.count : 0;
          const groups = groupsRes.status === 'fulfilled' ? groupsRes.value.data.data || [] : [];
          const badges = badgesRes.status === 'fulfilled' ? badgesRes.value.data || [] : [];
          const thumbnails = thumbnailRes.status === 'fulfilled' ? thumbnailRes.value.data.data : [];

          const avatarUrl = thumbnails.length > 0 ? thumbnails[0].imageUrl : 'N/A';
          let ageDays = 'N/A';
          if (profile.created) {
            const createdDate = new Date(profile.created);
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - createdDate.getTime());
            ageDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)).toString();
          }

          results.push({
            username: reqUsername,
            status: 'SUCCESS',
            data: {
              UserID: userId,
              Username: profile.name || foundUser.name,
              DisplayName: profile.displayName || foundUser.displayName,
              ProfileURL: `https://www.roblox.com/users/${userId}/profile`,
              Description: profile.description || 'N/A',
              IsBanned: profile.isBanned || false,
              AccountAgeDays: ageDays,
              JoinDate: profile.created || 'N/A',
              BadgeCount: badges.length || 0,
              CollectibleCount: 0, // Difficult to fetch without auth consistently
              GroupCount: groups.length || 0,
              FriendCount: friends || 0,
              FollowerCount: followers || 0,
              Avatar: avatarUrl
            }
          });
        } catch (innerErr) {
          console.error(`Error fetching details for user ${userId}:`, innerErr);
          results.push({ username: reqUsername, status: 'ERROR' });
        }
      }

      res.json({ results });
    } catch (err: any) {
      console.error('Lookup Error:', err.message);
      res.status(500).json({ error: 'Failed to look up users' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (require('fs').existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(500).send("<h3>Deployment Error!</h3><p>The 'dist' folder is missing. If you're on Render, make sure your <b>Build Command</b> is exactly: <br><br><code>npm install && npm run build</code></p>");
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
