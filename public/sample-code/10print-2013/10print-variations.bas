REM 10 PRINT Variations - Exploring the Maze Concept
REM ================================================

REM --- VARIATION 1: Explicit Binary Choice ---
REM Makes the randomness more obvious by using IF/THEN
10 IF RND(1) < 0.5 THEN PRINT CHR$(205); ELSE PRINT CHR$(206);
20 GOTO 10

REM --- VARIATION 2: Different Characters ---
REM Using ASCII characters instead of PETSCII
100 IF RND(1) < 0.5 THEN PRINT "/"; ELSE PRINT "\";
110 GOTO 100

REM --- VARIATION 3: With Newlines ---
REM Creates a more traditional maze structure
200 IF RND(1) < 0.5 THEN PRINT CHR$(205) ELSE PRINT CHR$(206)
210 GOTO 200

REM --- VARIATION 4: Extended Character Set ---
REM Using more PETSCII graphics characters
300 PRINT CHR$(205.5+RND(1)*6); : GOTO 300

REM --- VARIATION 5: Colored Maze (C64 specific) ---
REM Adds random colors to the output
400 PRINT CHR$(INT(RND(1)*8)+144);
410 PRINT CHR$(205.5+RND(1)); : GOTO 400

REM --- VARIATION 6: Controlled Randomness ---
REM Seeds the random number generator for reproducibility
500 R=RND(-TI)
510 PRINT CHR$(205.5+RND(1)); : GOTO 510

REM --- VARIATION 7: Modern BASIC (QBasic/FreeBASIC) ---
REM Adaptation for modern BASIC dialects
600 PRINT CHR$(47 + INT(RND * 2) * 45);
610 GOTO 600

REM --- VARIATION 8: Probability Adjustment ---
REM Not 50/50 - biases toward one character
700 IF RND(1) < 0.7 THEN PRINT CHR$(205); ELSE PRINT CHR$(206);
710 GOTO 700

REM --- VARIATION 9: Self-Modifying (Advanced) ---
REM Changes its own code during execution
800 POKE 2064, INT(RND(1)*2)+205
810 PRINT CHR$(PEEK(2064)); : GOTO 800

REM --- VARIATION 10: Structured Programming Version ---
REM What it might look like with subroutines
900 GOSUB 1000 : GOTO 900
1000 IF RND(1)<.5 THEN PRINT CHR$(205); ELSE PRINT CHR$(206);
1010 RETURN
