---
canDie: false
hasScore: true
rewards: true
leaderboards:
  - id: wins
    label: Wins
    order: desc
    mode: best
    reset: none
    reportedBy: server
notApplicable:
  gems: Nothing in Crazy 8 Ball is sold for Gems (project rule); cues, ability spins, slots and every reward are bought with in-game cash.
  deathScreen: Nobody dies in a pool game. Falling off the roof only resets the player (owner's decision, canDie false).
  gameplayBanners: Screen ads run on the lobby, results and panel screens; gameplay is declared but its banners stay off (owner's choice).
  menuScreen: There is no title menu; the game opens straight into the rooftop hub.
  partyApi: Hosted on Boxity and joined through Legion.SDK.net.resolveEndpoint (room maxClients 24), so party play and Play with friends are handled by the matchmaker.
  hubPlatform: Not a platform hub (Legion.SDK.platform).
  settingsButton: The HUD Settings gear stays (owner's decision). It opens only the game's own toggles that Boxity's menu has no control for (sound effects and ambience mix, lounge piano, guide arrow, name tags, night mode); volume, graphics, sensitivity and FPS come from Boxity's menu, and Escape opens Boxity's pause menu.
  emoteButton: The in-game EMOTE button and panel stay (owner's decision) next to Boxity's own emote picker, which the game also supports (registerFeature 'emotes').
  friendsUi: Boxity draws invites, friends and parties; the game only reports its room (game.updateRoom) and players (playerJoined / playerInRoom).
---

# Crazy 8 Ball: Boxity integration

A rooftop pool lounge where every match is between real players. Frontend: this repo (Vite + three.js).
Game server: `../Crazy-8-ball-backend` (Colyseus on Boxity hosting).

- Score: match wins. The game server counts them (a match result the server ran) and reports the
  Wins board and the profile stats (Match Wins, Matches Played); the browser only declares the board.
- Rewarded ad: on the match result card, "Watch an ad: 2x cash". The server checks the ad's reward
  token before the cash is granted, once per match.
- Screens: `lobby` (waiting on a table's join pad), `results` (the match result card), `panel`
  (Cues, Rewards, Ranked, Ability Spin and the settings window), `gameplay` (everything else).
