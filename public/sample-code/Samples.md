# Sample Projects for CCS Workbench

This file defines the sample projects available in the "Load Sample" dropdown.
The CCS Workbench reads this file at runtime to populate the sample projects list.

## Format

Each sample project is defined on a single line with the following format:

```
- folder/filename.ccs: Display Name | mode | Description | era | annotation_count
```

**Fields:**
- `folder/filename.ccs` - Path to the project file (must end in .ccs)
- `Display Name` - How the project appears in the dropdown
- `mode` - One of: critique, archaeology, interpret, create
- `Description` - Brief description shown in the dropdown
- `era` - Optional era badge (e.g., "1960s", "1980s")
- `annotation_count` - Optional number of annotations

## Available Sample Projects

- flowmatic-1958/flowmatic-1958.ccs: 1958 - FLOW-MATIC | critique | Grace Hopper's business English - first natural language programming | 1950s | 0
- iplv-1958/iplv-1958.ccs: 1958 - IPL-V | critique | Newell, Shaw, and Simon's list processing - Logic Theorist and General Problem Solver | 1950s | 0
- eliza/eliza-1965b-CR.ccs: 1965 - ELIZA (Annotated) | critique | Complete critique session with 30+ scholarly annotations | 1960s | 30
- apollo-11-comanche/comanche055.ccs: 1969 - Apollo 11 Comanche055 | critique | Command Module guidance computer source code | 1960s | 0
- apollo-11-luminary/luminary099.ccs: 1969 - Apollo 11 Luminary099 | critique | Lunar Module guidance computer source code | 1960s | 0
- xmodem-1977/xmodem-1977.ccs: 1977 - XMODEM Protocol | critique | Ward Christensen's MODEM.ASM - foundational BBS file transfer protocol | 1970s | 0
- adventure-1977/adventure-1977.ccs: 1977 - Colossal Cave Adventure | critique | Will Crowther's original FORTRAN IV source code | 1970s | 0
- gnu-emacs-1985/gnu-emacs-1985.ccs: 1985 - GNU Emacs | critique | Richard Stallman's free software manifesto - GPL, hacker culture, and software freedom | 1980s | 0
- agrippa-1992/agrippa-1992.ccs: 1992 - Agrippa (A Book of the Dead) | critique | William Gibson's self-encrypting poem - electronic literature and digital preservation | 1990s | 0
- my-boyfriend-1996/my-boyfriend-1996.ccs: 1996 - My Boyfriend Came Back from the War | critique | Olia Lialina's frame-splitting narrative - net.art and vernacular web aesthetics | 1990s | 0
- git-stash-2007/git-stash-2007.ccs: 2007 - Git Stash | critique | Nanako Shiraishi's original script - feminist computing history and workplace interruption | 2000s | 0
- 10print-2013/10print-2013.ccs: 2013 - 10 PRINT CHR$(205.5+RND(1)); GOTO 10 | critique | Montfort et al.'s book-length analysis of one line of C64 BASIC (1982) | 2010s | 11
- transformer-2017/transformer-2017.ccs: 2017 - Transformer Architecture | critique | Attention Is All You Need - multi-head attention and the foundation of modern LLMs | 2010s | 0
- esolangs-2026/esolangs-2026.ccs: 2026 - Esoteric Programming Languages Collection | critique | Nine foundational esolangs (INTERCAL, FALSE, brainfuck, Befunge, Malbolge, Piet, Shakespeare, Chef, Whitespace) demonstrating computational critique and hacker folk art | 1990s | 0

## Adding Your Own Sample Projects

1. Create a complete project in the CCS Workbench
2. Save it as a .ccs file using File > Save
3. Create a subfolder in `public/sample-code/` (e.g., `myproject/`)
4. Place the .ccs file in the subfolder
5. Add an entry to this file following the format above
6. Rebuild or restart the application

The project will appear in the "Load Sample" dropdown in the code files panel.
