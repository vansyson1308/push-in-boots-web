# Push In Boots — design pillars

This is the one-page sheet the game is judged against. It was written after reading
Jesse Schell's *The Art of Game Design: A Book of Lenses* cover to cover and asking each
lens of the Unity build (0.3.1). Lens numbers are in brackets.

## The sentence

> **The cowboy cat who doesn't shoot goblins — he PUSHES them.**

Secret purpose [#100]: make a stranger laugh in ten seconds and want to send it to someone.

Essential experience [#1]: you are a tiny, unflappable cat with an absurdly powerful water
blaster, and everything you spray goes *flying*.

## What was wrong with 0.3.1

| Lens | Finding |
| --- | --- |
| Unification [#9], Inner Contradiction [#82] | The title says *push*, the game *shot*. Goblins were HP sponges that popped. |
| Toy [#15] | Spraying was not fun without a goal: hits were weightless. |
| Surprise [#2], Emergence [#23] | After one play there was nothing left to discover; no chain reactions. |
| Triangularity [#33] | No risky/high-reward option anywhere. One correct way to play. |
| Punishment [#41] | Hearts + lives + paid continues: three punishments stacked on the retries a sticky game needs. |
| Judgment [#20] | Stars were opaque; the player never learned what a better run looks like. |
| Simplicity [#42], Raven [#99] | Coins, seeds, stars, crops, hats, missions: many nouns, little meaning [#5]. |
| Friendship [#84], Community [#86], Pitch [#95] | Nothing to tell a friend, nothing to send, no shared event. |
| Technology [#92], Crystal Ball [#93] | 53 MB engine download before the first frame of a 2-minute arcade game. |

## Pillars

1. **Water is force** [#26 foundational rule]. Every drop applies impulse ÷ mass. A goblin that
   loses its footing becomes a tumbling projectile that bowls over other goblins, smashes
   crates, sets off bombs and dents bosses. Pits, walls and their own explosives are the
   real weapons.
2. **Risk pays** [#33]. Dunking a goblin in a pit pays ×3, bowling pays ×2, point-blank
   spray pushes harder, chains multiply everything and expire fast.
3. **One verb, many objects** [#23, #43]. The jet shoves goblins, bombs, hay bales,
   barrels and cages, and its recoil lifts the cat (spray down to hover).
4. **Failure is cheap, mastery is deep** [#31, #41]. No lives, no paid continues, retry in
   under a second. Finishing is easy; three stars, S ranks and the daily are hard.
5. **A moment worth telling** [#65, #95]. The game tracks your biggest chain, turns it
   into a share card and a challenge link that drops a friend into the same seed.
6. **Kindness by construction** [#97, #98]. Soaked goblins surrender and run home.
   No timers, no energy, no nagging, no data leaves the device.

## Systems (and the lens that asked for them)

- **Chain meter** [#18 flow, #40 reward, #57 feedback]: each wash-out within 2.6 s raises the
  chain; pitch climbs a scale, callouts appear, time slows at ×5 and above.
- **Wash-out types** [#2, #24]: *Washed* ×1, *Bowled* ×2 (hit by a flying goblin),
  *Slammed* ×2 (wall at speed), *Dunked* ×3 (pit), *Kaboom* ×2 (their own bomb).
- **Big Splash** [#18 sawtooth]: chains fill a meter; unleashing it sends a wall of water
  across the screen. The tension/release beat of every stage.
- **Blasters by push profile, not damage** [#32]: Pea Popper (one firm knock), Rapid Purr
  (sustained shove), Fan Spray (wide, close), Beam Whisker (pierces a line), Spicy Fizz
  (lobbed geyser that launches upward).
- **Recoil hop** [#23, #27]: spraying downward in the air hovers the cat.
- **Bosses are pushed, not drained** [#9, #51]: water on the weak point and flung minions
  shove each machine back along its arena until it rolls off the far edge.
- **Transparent judgment** [#20]: three named objectives per stage (finish, every kitten
  home, a score target) plus a rank, and one line saying what the next star needs.
- **Collusion** [#73]: a goblin shows off beside most pits; a goblin washed out with a pit just
  ahead skids and plops into it instead of sailing over; when you are on your last heart goblins
  hesitate; after two falls in the same place the gap gets a helper plank.
- **Chance, in rewards only** [#29]: every run stage hides one loot goblin that runs away with a
  sack of coins, and every washed-out goblin shakes loose a coin or three. Damage is never random.
- **Three gateways** [#74, #86]: Story (15 stages), Daily Roundup (one seed for the whole
  world, 90 s), Endless Stampede.
- **Expression** [#85]: water colours and a kitten buddy are visible in play and on every
  share card.
- **The farm shows your progress** [#49, #83]: rescued kittens and recovered grain appear on
  the map screen; nothing in the meta is a chore.

## Tuning (see `src/sim/tune.js`)

Balance is tuned by doubling and halving [#47]: every number that shapes the push lives in
one file. Third-star score targets are not guessed: `tools/calibrate.mjs` sets each one to 90%
of the best run by the test bot, so every target has been reached at least once.

## Playtest questions [#91]

The bot proves stages can be finished; it cannot say whether they are fun. With five people
who have never seen the game, on their own phones, watch for:

1. Do they push a goblin into a pit without being told to?
2. Do they laugh in the first 20 seconds?
3. Do they replay a stage unprompted?
4. Afterwards, can they describe one moment?
5. Where did they look bored, and what are the three worst parts?

## Decision log

- *Lives and paid continues removed.* They punished the behaviour (retrying) we want most.
- *Crops, seeds as currency, missions removed.* Nobody would miss them [#99]; grain sacks
  remain as the stage's hidden collectible.
- *Hats are baked into the painted poses,* so cosmetics moved to water colour and buddy.
- *No global leaderboard.* There is no server and URL scores are forgeable [#87]; challenges
  are friend-to-friend claims, with wordlist names instead of free text.
- *Unity runtime dropped.* The game is now plain ES modules and a canvas: 8 MB instead of
  53 MB, first frame in about a second, works offline.
