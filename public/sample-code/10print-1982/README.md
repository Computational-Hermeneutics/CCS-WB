# 10 PRINT CHR$(205.5+RND(1)); : GOTO 10

**Year**: 1982
**Platform**: Commodore 64 BASIC v2
**Type**: Generative maze algorithm
**Cultural Status**: Icon of computational aesthetics

## Overview

This single line of BASIC code, typed at the Commodore 64's prompt, generates an endless ASCII maze. It became so culturally significant that MIT Press published an entire book analyzing it from multiple perspectives: code studies, platform studies, randomness, aesthetics, and computational creativity.

The program demonstrates:
- **Minimalism**: Maximum effect from minimal code
- **Randomness**: Simple probabilistic decision making
- **Aesthetics**: Emergent visual complexity from simple rules
- **Platform specificity**: Relies on C64's character set (PETSCII)
- **Infinity**: An endless generative process

## Historical Context

In the early 1980s, type-in programs were common in computer magazines. This one-liner appeared in various forms and became emblematic of:
- Home computing accessibility
- Creative coding as exploration
- The BASIC language's immediate, conversational nature
- The Commodore 64's dominance in 1980s home computing

## The Code

```basic
10 PRINT CHR$(205.5+RND(1)); : GOTO 10
```

Breaking it down:
- `10` - Line number (BASIC convention)
- `PRINT` - Output to screen
- `CHR$()` - Convert number to character
- `205.5+RND(1)` - Random choice between 205 and 206
- `RND(1)` - Random float between 0 and 1
- Characters 205 and 206 are diagonal lines in PETSCII: `╱` and `╲`
- `;` - Print without newline
- `:` - Statement separator
- `GOTO 10` - Loop forever

## Why It Matters

This program sits at the intersection of:
- **Art and computation**: It's generative art before the term existed
- **Accessibility**: Anyone could type it and see immediate results
- **Constraint**: Working within platform limitations produced creativity
- **Emergence**: Complex patterns from simple rules
- **Nostalgia**: Evokes the exploratory spirit of early computing

## The Book

"10 PRINT CHR$(205.5+RND(1)); : GOTO 10" (MIT Press, 2012) by Nick Montfort and collaborators analyzes this code through ten chapters exploring randomness, mazes, the Commodore 64 platform, and BASIC's design.

## Variations

This maze concept has been reimplemented in countless languages, from JavaScript to Python to Scratch. Each implementation reveals different assumptions about randomness, display, and control flow.

## Try It

To experience the original:
- Load a C64 emulator (VICE)
- Type the line at the READY prompt
- Press RETURN
- Watch the maze generate
- Press RUN/STOP to halt

The variations file shows how the same concept translates to modern languages, revealing what was implicit in the original.
