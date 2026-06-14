# Spacewar! (1962)

## Historical Context

**Spacewar!** is widely regarded as the first true digital video game. It was
written for the PDP-1 at the Massachusetts Institute of Technology between
late 1961 and 1963 by a loose collective associated with the **Tech Model
Railroad Club** and the **Hingham Institute Study Group on Space Warfare**.
The PDP-1 was Digital Equipment Corporation's flagship minicomputer, and
the Type 30 vector display had only been installed at MIT on **29 December
1961** — Spacewar! is one of the very first applications written for it.

The project crystallised the *hacker* ethos that would shape computing
culture for decades: code as artefact to be shared, modified, and improved
in public; constants and outlines exposed for tuning; ports and forks
welcomed. The PDP-1 emulator at the [Computer History
Museum](https://www.computerhistory.org/) still runs the program today.

## Why it matters for CCS

This is rich material for critical close reading along several axes:

- **Material conditions of early computing.** The code is shaped at every
  level by the PDP-1's architecture — 18-bit words, a vector display drawn
  by writing to a memory-mapped register, hand-tuned octal constants,
  cooperative scheduling. The Type 30 display's persistence determined the
  game's frame rate.
- **The "hacker" mode of production.** The source is full of comments
  marking who modified what and when; constants are clearly flagged for
  tuning; the ship outlines are themselves a small interpreted bytecode
  ("the outline compiler") — arguably one of the earliest just-in-time
  compilers. The code was *designed* to be modified.
- **Authorship distributed across a community.** No single author. Steve
  Russell is conventionally credited as the primary architect, but Dan
  Edwards wrote the outline compiler and the gravity system, Peter Samson
  contributed the **Expensive Planetarium** starfield (drawn from actual
  star catalogue data), Martin Graetz designed hyperspace.
- **Version proliferation as cultural form.** At least 15 versions are
  documented. Multiple people forked, modified, extended. Some versions are
  lost. This is collaborative software development *as* a humanities
  practice, decades before "free software" was a slogan.
- **Play, work, war.** The Hingham Institute Study Group on **Space
  Warfare** wasn't ironic — Spacewar! sits in a Cold War imaginary of
  ballistics, orbital mechanics, and adversarial dyads. The two ships are
  named *Wedge* and *Needle*. Torpedoes are limited; fuel is limited; the
  central star pulls everything inward. Read the code as a war game and
  the constants take on a different cast.

## A note on this folder on disk

When you open this sample inside CCS-WB, the workbench loads
everything — every source listing, the README you are reading,
the annotations — from a single self-contained project file
[`spacewar-1962.ccs`](spacewar-1962.ccs). That `.ccs` is JSON
with the file metadata in `codeFiles[]` and the actual file
bodies inlined in `codeContents{}`; nothing in it points at
the loose files sitting next to it.

The 26 loose `.txt` files (and the on-disk copy of this
README) in this directory are **external copies of what is
already inlined in the `.ccs`**. They exist so the corpus is
directly browsable and greppable on GitHub, downloadable
individually, and usable outside the workbench — they have no
role in how the workbench loads the project. Most other
samples in the library are shipped *only* as a `.ccs` for that
reason (see e.g. [`adventure-1977/`](../adventure-1977/),
[`git-stash-2007/`](../git-stash-2007/)); Spacewar! keeps both
because its corpus is a primary scholarly object that benefits
from external readability. If a loose file disappears, nothing
in CCS-WB breaks; if the `.ccs` disappears, the project does.

## The versions in this project

This sample ships **every recoverable version of the Spacewar! source
code** — every release linked from
[spacewar1962.github.io/spacewar/code.html](https://spacewar1962.github.io/spacewar/code.html)
for which a text listing survives. Versions for which only paper-tape
binaries or no copy at all exist are noted in the "Versions not included
here" section below.

## How the files are organised in the workbench

The 26 files are split across the **root** and three subfolders so
the files pane stays navigable. You can collapse any subfolder by
clicking its header (state is remembered across reloads):

| Level | What lives there | Files |
|---|---|---|
| **root** | This README + every real Spacewar! game source listing, chronological from v1 to v4.8 (15 sources). The root is the canonical reading list. | README.md, the 11 game versions, the three v4.8 paper-tape segments |
| **`supporting/`** | Source files the game itself depends on or relates to but which aren't game versions: the MACRO assembler definitions, Peter Samson's actual star catalogue data, a later hyperspace patch, the sibling Snowflake program. | 4 files |
| **`docs/`** | Patches and documentation describing how to use or modify the program — sense-switch settings, the auto-restart patch, the Minskytron hyperspace how-to. | 3 files |
| **`disassemblies/`** | Scholarly recovery from paper-tape binaries for which no text source survives. Reading these *alongside* the corresponding game-version listings shows what disassembly recovers and what it cannot — comments, names, authorial intent. | 3 files |

This layout follows a simple rule used across the sample library:
**real source code at the root, supporting material in subfolders.**

### `spacewar_1_early1962_reconstructed.txt` — Version 1 (early 1962)

The first playable iteration: two ships, a supply of torpedoes, a random
starfield. **No gravity. No hyperspace. No central star.** Reconstructed
in 2016/2021 by Norbert Landsteiner from version 2B and from J. M.
Graetz's recollection in *The Origin of Spacewar*:

> By February, the first game was operating. It was a barebones model:
> just the two ships, a supply of fuel, and a store of "torpedoes".

Annotated by Landsteiner as "**NOT AN AUTHENTIC PROGRAM**" — read it
as a reconstructed historical hypothesis, not a primary source. Its
value for CCS is precisely this: a scholar's attempt to recover what
the earliest playable Spacewar! *must* have looked like, by working
backwards from the surviving 2B.

### `spacewar_2b_25mar62.txt` — Version 2B (25 March 1962)

A snapshot of 2B six days before the canonical 2 April listing. Useful
as a comparison: small differences between this and `spacewar_2b_2apr62`
show what was being tuned in the final week before public release.

### `spacewar_2b_m_2016.txt` — Version 2B-m (Landsteiner, 2016/2022)

Norbert Landsteiner's modernised reconstruction of 2B, dated *"nl, 8
mar 2016, 9 apr 2022"*. A scholarly recovery effort — read alongside
the two genuine 2B listings to see where 21st-century critical
reconstruction parts company with the surviving primary sources.

### `spacewar_2b_2apr62.txt` — Version 2B (2 April 1962)

The **first complete public version**. Gravity is now in (Dan Edwards's
work), Peter Samson's Expensive Planetarium starfield is in (real star
positions, magnitudes mapped to display intensity), and Martin Graetz's
*Minskytron* hyperspace lets a ship escape danger by — sometimes —
emerging somewhere safer, and — sometimes — not.

This is the version usually meant when people speak of "the original
Spacewar!". It went out from MIT to other PDP-1 sites and seeded the
forks.

### `spacewar_3.1_complete.txt` — Version 3.1 (24 September 1962)

The **canonical, most-preserved version**. Steve Russell returned briefly
to MIT and consolidated the scattered patches into a single coherent
program. This is the version most emulators run, the version the
Computer History Museum's PDP-1 restoration plays, and the version the
*spacewar1962.github.io* project itself runs in its browser emulator.
If you're going to read one version closely, this is the canonical
target.

### The 4.x generation (February–July 1963)

A second generation of forks led primarily by Monty Preonas ("ddp"),
introducing **floating-point gravity**, hardware multiply/divide use,
the first on-screen **score display**, a dual-console "split screen",
and a *subjective* first-person view from the *Needle*'s perspective.

#### `spacewar_4.1f.txt` — Version 4.1f (20 February 1963, modified 2005–08)

Computer History Museum reconstruction by "prs.": the 4.1 base of the
4.x generation with the 4.8 score display grafted on and star
intensities remapped for modern displays. Marked *"SW4.1d"* in the
header; the "d/dfw" provenance line is signed by an unknown "dfw" who
recurs through the 4.x family.

#### `spacewar_4.2a.txt` — Version 4.2a (22 February 1963)

Working single-shot torpedo mode; the central sun rendered as a fainter
dotted point. Combined in the bitsavers archive with 4.1f as a single
file; here separated for line-by-line comparison.

#### `sw41d_combined.txt` — Original combined listing as it ships at bitsavers

The artifact as it actually exists in the bitsavers RLE PDP-1 archive
([`bitsavers.org/pdf/mit/rle_pdp1/spacewar/sw41d.txt`](https://bitsavers.org/pdf/mit/rle_pdp1/spacewar/sw41d.txt)) —
both 4.1f and 4.2a concatenated in one file, signed "SW4.1d / dfw".
Preserved here for readers who want the source-as-found, distinct
from the split-for-reading files above. (The "d" suffix and the
"dfw" signature appearing across the whole 4.x family are themselves
worth a close reading.)

#### `spacewar_4.3f.txt` — Version 4.3 *Twin Star* (17 May 1963)

The **subjective view** experiment: rendering from the *Needle*'s
point of view rather than the conventional bird's-eye. An early
exploration of camera-as-character that would not really return to
mainstream games for another two decades. Read as one of the earliest
investigations of *point of view* as a representational variable in
interactive software.

#### `spacewar_4.4.txt` — Version 4.4 (21 May 1963)

**Dual-console version.** Alternating-frame display: each player's
own console shows their ship centred. Cooperative scheduling on a
single CPU drives two physically separate screens. A small marvel of
display multiplexing on 1963 hardware.

#### `spacewar_4.4f.txt` — Version 4.4 variant

Companion listing to 4.4 with the "f" annotations (provenance unclear
in the surviving record). Worth comparing against `4.4` to see what
the "f" suffix marks across the 4.x family.

#### `spacewar_4.8_pt1.txt` + `spacewar_4.8_pt2.txt` + `spacewar_4.8_scorer.txt` — Version 4.8 (24 July 1963)

The **apparently final MIT version**. Polished on-screen score
display by Peter Samson, signed by "dfw". Distributed historically as
three paper-tape segments — *part 1* (main game), *part 2*
(continuation), and *scorer* (the score display routine, isolable as
a separate listing because it was a later addition). Reading all
three together yields the program as last left at MIT before the
public PDP-1 sites took over development.

### `spacewar2015.txt` — Spacewar! 2015 (Landsteiner)

Landsteiner's *new* PDP-1 program written in 2015, not a port: a fresh
implementation that revives Martin Graetz's *Minskytron* hyperspace
signature and the working subjective view from 4.3 Twin Star. Read as
a *retrospective* on the 1962–63 family — what survives, what's
recovered, what's reinterpreted by a 21st-century critical author.

## Supporting source files

Companion listings included because Spacewar! cannot really be
read without them:

### `macro_fiodec.txt` — MACRO assembler definitions (June 1963)

Without these definitions a reader cannot understand the listings.
Pseudo-ops, character codes, the conventions for octal directives —
all the language the Spacewar! source is written *in*.

### `stars_expensive_planetarium.txt` — Peter Samson's Expensive Planetarium star data (March 1962)

Real star catalogue positions and intensities, mapped to PDP-1 Type 30
display coordinates. The background of every Spacewar! game played at
MIT in 1962 was an actual photograph of the sky, hand-coded. This is
the data that made it possible.

### `hyperspace85.txt` — Hyperspace 1985 patch

Later patch reviving Martin Graetz's *Minskytron* hyperspace effect for
later PDP-1 emulation work. Useful to see what "porting forward" looks
like across two decades.

### `snowflake_sa-100.txt` — Snowflake (John Saponara)

Not a Spacewar! version — a *sibling* PDP-1 graphics program from the
same scene, included for context: the visual culture Spacewar! emerged
from. Brief and worth comparing for what an "abstract" PDP-1 graphics
program looks like next to a game.

## Patches and documentation

### `spacewar-senseswitches.txt`

Comprehensive documentation of the sense-switch settings for Spacewar!
3.1 and the 4.x family — *which physical front-panel toggle does what*.
Configuration as material practice rather than menu screen.

### `spacewAutoRestartPatch.txt`

Auto-restart patch for Spacewar! 2B. Small; the kind of housekeeping
modification that accumulates around a long-running program.

### `minskytron-hyperspace-howto.txt`

Walkthrough for adding the *Minskytron Hyperspace Signature* effect to
Spacewar! 4.1 — a documented worked example of the kind of modification
the 4.x family was built to invite.

## Disassemblies — scholarly recovery from paper-tape binaries

When the only surviving artifact of a version is its paper-tape binary
(no text listing), the scholar's tool is disassembly. These three are
that work made visible:

### `spacewar_2b_disassembly.txt`

A full disassembly of the 2B paper-tape image (~3,900 lines). Compare
line-by-line against `spacewar_2b_2apr62.txt` and `spacewar_2b_25mar62.txt`
to see what disassembly recovers and what it cannot — comments, names,
intent.

### `hyperspace85_disassembly.txt`

Disassembly of the hyperspace85 binary, attributed to *"jmg 62"* —
that is, the disassembler's reconstruction posits **J. M. Graetz, 1962**
as origin. A small piece of *forensic* attribution worth reading
critically.

### `spaceWarRstrt_disassembly.txt`

Disassembly of the restart-patch binary, paired with
`spacewAutoRestartPatch.txt` above (the source). Read source-and-
disassembly together to see what compilation drops on the floor and
what disassembly invents to put back.

## Versions not included here

These exist only in lost or non-textual form:

- **2A** (March 1962, lost) — inferred integration stage; Dan Edwards's
  gravity work folded in; no surviving source.
- **4.0** (2 February 1963) — referenced as the foundation of the 4.x
  line; no separate listing linked.
- **4.2** (11 May 1963, lost) — Monty Preonas variant, first on-screen
  score display drawn via ship outlines.
- **4.5, 4.6, 4.7** (May–July 1963, lost) — the gap between 4.4 and
  4.8. Comments in 4.8 suggest one of these offered dual thrust/velocity
  controls; another possibly addressed 4.4's twin-star display fault.
  Untestable.

Other variants known but not shipped here:

- **Holloman Air Force Base variant** — restores altered starting
  positions from 1966 player recordings.
- **Spacewar! 2015** (Landsteiner) — new PDP-1 program reviving
  Minskytron hyperspace and the working subjective view.
- **"Winds of Space"** — parameter hack modifying torpedo trajectories
  via one memory constant.

For pointers to source for these, see
[spacewar1962.github.io/spacewar/code.html](https://spacewar1962.github.io/spacewar/code.html)
and Norbert Landsteiner's archive at
[masswerk.at/spacewar/sources/](https://www.masswerk.at/spacewar/sources/).

## The team

| Role | Person |
|---|---|
| Primary architect | Steve Russell |
| Outline compiler + gravity | Dan Edwards |
| Expensive Planetarium starfield | Peter Samson |
| Hyperspace (*Minskytron*) | Martin Graetz |
| 4.x generation (floating-point) | Monty Preonas ("ddp") |
| 4.8 score display + final polish | Peter Samson, unknown "dfw" |
| Modern reconstructions (v1, 2015) | Norbert Landsteiner |

## Suggested annotations

When close-reading these programs, consider:

1. **The Type 30 display register.** Every visible mark on the screen is
   produced by writing an X/Y coordinate to a memory-mapped display
   register. Find that write and trace how the game's "world" becomes
   visible.
2. **The outline compiler.** The ships' shapes are not bitmaps; they are
   little programs in a custom interpreted language whose source is octal
   constants in the listing. Read this as **vector graphics as bytecode**.
3. **Constants tagged as tunable.** The header comments often flag which
   constants are meant to be hacked. This is the source as *invitation*.
4. **Random vs. authored starfield.** Compare the random starfield in v1
   with Samson's Expensive Planetarium in v2B/v3.1. What does it mean to
   draw the *actual sky*?
5. **Hyperspace.** Graetz's *Minskytron* effect was a deliberate visual
   citation — read it semiotically. Why does the escape look like that?
6. **The central star's gravity.** The way the two-body problem is
   approximated in fixed-point integer arithmetic on a 1961 machine is a
   small marvel; the v1 → v2B addition is one of the great moments in
   game-engine history.
7. **Sense switches.** Configuration is via physical toggle switches on
   the PDP-1 front panel — a different politics of "settings" than any
   modern game.
8. **Authorship in comments.** Who is named, when, and how? What is the
   social structure of this code?
9. **War, play, ballistics.** The two ships are *Wedge* and *Needle*; the
   group is the **Hingham Institute Study Group on Space Warfare**. Cold
   War orbital mechanics as a leisure object.

## References and sources

- [spacewar1962.github.io](https://spacewar1962.github.io/) — canonical
  scholarly site for Spacewar!, including a browser emulator running v3.1.
- Graetz, J. M. (1981). "The Origin of Spacewar." *Creative Computing* 7(8).
- Brand, S. (1972). "SPACEWAR: Fanatic Life and Symbolic Death Among the
  Computer Bums." *Rolling Stone*, 7 December 1972.
- Lowood, H. (2009). "Videogames in Computer Space: The Complex History
  of *Pong*." *IEEE Annals of the History of Computing* 31(3).
- Norbert Landsteiner, [masswerk.at/spacewar](https://www.masswerk.at/spacewar/) —
  reconstructions, archive of source listings, and a JavaScript PDP-1
  emulator.
- DEC, *PDP-1 Handbook* (1963) — for the architecture the program is
  shaped against.

## Files

- `README.md` — this file.

**Game versions (chronological):**
- `spacewar_1_early1962_reconstructed.txt` — Version 1, reconstructed (early 1962).
- `spacewar_2b_25mar62.txt` — Version 2B, 25 March 1962.
- `spacewar_2b_m_2016.txt` — Version 2B-m (Landsteiner modernisation, 2016/22).
- `spacewar_2b_2apr62.txt` — Version 2B, 2 April 1962.
- `spacewar_3.1_complete.txt` — Version 3.1, 24 September 1962 (**canonical**).
- `spacewar_4.1f.txt` — Version 4.1f, CHM reconstruction (1963/2005).
- `spacewar_4.2a.txt` — Version 4.2a, 22 February 1963.
- `sw41d_combined.txt` — Original bitsavers listing (4.1f + 4.2a unsplit).
- `spacewar_4.3f.txt` — Version 4.3 *Twin Star* subjective view, 17 May 1963.
- `spacewar_4.4.txt` — Version 4.4 dual-console, 21 May 1963.
- `spacewar_4.4f.txt` — Version 4.4 variant.
- `spacewar_4.8_pt1.txt` — Version 4.8, part 1 (main game), 24 July 1963.
- `spacewar_4.8_pt2.txt` — Version 4.8, part 2 (continuation).
- `spacewar_4.8_scorer.txt` — Version 4.8, score display routine.
- `spacewar2015.txt` — Landsteiner's new PDP-1 program (2015).

**Supporting source:**
- `macro_fiodec.txt` — MACRO assembler definitions (June 1963).
- `stars_expensive_planetarium.txt` — Samson's star catalogue data (March 1962).
- `hyperspace85.txt` — Hyperspace 1985 patch.
- `snowflake_sa-100.txt` — Snowflake (Saponara), sibling PDP-1 graphics program.

**Patches and documentation:**
- `spacewar-senseswitches.txt` — Sense-switch settings documented.
- `spacewAutoRestartPatch.txt` — Auto-restart patch for 2B.
- `minskytron-hyperspace-howto.txt` — Adding Minskytron hyperspace to 4.1.

**Disassemblies (scholarly recovery from paper-tape binaries):**
- `spacewar_2b_disassembly.txt` — Full disassembly of 2B paper-tape image.
- `hyperspace85_disassembly.txt` — Disassembly of hyperspace85 binary.
- `spaceWarRstrt_disassembly.txt` — Disassembly of the restart-patch binary.

Source for the listings: Norbert Landsteiner's archive at
[masswerk.at/spacewar/sources/](https://www.masswerk.at/spacewar/sources/).
