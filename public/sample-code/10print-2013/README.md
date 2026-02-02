# 10 PRINT CHR$(205.5+RND(1)); : GOTO 10

**Authors**: Nick Montfort, Patsy Baudoin, John Bell, Ian Bogost, Jeremy Douglass, Mark C. Marino, Michael Mateas, Casey Reas, Mark Sample, Noah Vawter

**Published**: The MIT Press, 2013 (Cambridge, Massachusetts; London, England)

**Year**: 1982 (original program)

**Platform**: Commodore 64 BASIC v2

**Type**: Generative maze algorithm

**Cultural Status**: Icon of computational aesthetics, subject of entire scholarly book

---

## The Program

```basic
10 PRINT CHR$(205.5+RND(1)); : GOTO 10
```

One line of code, set to repeat endlessly, which will run until interrupted.

---

## From the Book: Introduction

Computer programs process and display critical data, facilitate communication, monitor and report on sensor networks, and shoot down incoming missiles. But computer code is not merely functional. Code is a peculiar kind of text, written, maintained, and modified by programmers to make a machine operate. It is a text nonetheless, with many of the properties of more familiar documents. Code is not purely abstract and mathematical; it has significant social, political, and aesthetic dimensions. The way in which code connects to culture, affecting it and being influenced by it, can be traced by examining the specifics of programs by reading the code itself attentively.

Like a diary from the forgotten past, computer code is embedded with stories of a program's making, its purpose, its assumptions, and more. Every symbol within a program can help to illuminate these stories and open historical and critical lines of inquiry. Traditional wisdom might lead one to believe that learning to read code is a tedious, mathematical chore. Yet in the emerging methodologies of **critical code studies**, **software studies**, and **platform studies**, computer code is approached as a cultural text reflecting the history and social context of its creation. "Code . . . has been inscribed, programmed, written. It is conditioned and concretely historical," new media theorist Rita Raley notes (2006). The source code of contemporary software is a point of entry in these fields into much larger discussions about technology and culture. It is quite possible, however, that the code with the most potential to incite critical interest from programmers, students, and scholars is that from earlier eras.

This book returns to a moment, the early 1980s, by focusing on a single line of code, a BASIC program that reads simply:

**10 PRINT CHR$(205.5+RND(1)); : GOTO 10**

One line of code, set to repeat endlessly, which will run until interrupted.

---

## Why This Matters: Core Contributions

This book is unusual in its focus on a single line of code, an extremely concise BASIC program. Studies of individual, unique works abound in the humanities. Roland Barthes's *S/Z*, Samuel Beckett's *Proust*, Rudolf Arnheim's *Genesis of a Painting: Picasso's Guernica*, Stuart Hall et al.'s *Doing Cultural Studies: The Story of the Sony Walkman*, and Michel Foucault's *Ceci n'est pas une pipe* all exemplify the sort of close readings that deepen our understanding of cultural production, cultural phenomena, and the Western cultural tradition. While such literary texts, paintings, and consumer electronics may seem significantly more complex than a one-line BASIC program, undertaking a close study of 10 PRINT as a cultural artifact can be as fruitful as close readings of other telling cultural artifacts have been.

### First: Programming as Scholarship

To understand code in a critical, humanistic way, the practice of scholarship should include programming: modifications, variations, elaborations, and ports of the original program. The programs written for this book sketch the range of possibilities for maze generators within Commodore 64 BASIC and across platforms. By writing them, the 10 PRINT program is illuminated, but so, too, are some of the main platforms of home computing, as well as the many distinctions between Commodore 64 BASIC and contemporary programming environments.

### Second: Formal Workings Connect to Culture

There is a fundamental relationship between the formal workings of code and the cultural implications and reception of that code. The program considered in this book is an aesthetic object that invites its authors to learn about computation and to play with possibilities: the importance of considering specific code in many situations.

### Third: Code is Understandable

Code is ultimately understandable. Programs cause a computer to operate in a particular way, and there is some reason for this operation that is grounded in the design and material reality of the computer, the programming language, and the particular program. This reason can be found. The way code works is not a divine mystery or an imponderable. Code is not like losing your keys and never knowing if they're under the couch or have been swept out to sea through a storm sewer. The working of code is knowable. It definitely can be understood with adequate time and effort. **Any line of code from any program can be as thoroughly explicated as the eponymous line of this book.**

### Fourth: Code is Cultural Resource

Code is a cultural resource, not trivial and only instrumental, but bound up in social change, aesthetic projects, and the relationship of people to computers. Instead of being dismissed as cryptic and irrelevant to human concerns such as art and user experience, code should be valued as text with machine and human meanings, something produced and operating within culture.

---

## Token-by-Token Analysis

### 10

The only line number in this program is 10, which is the most conventional starting line number in BASIC. Numbering lines in increments of 10, rather than simply as 1, 2, 3, . . . , allows for additional lines to be inserted more easily if the need arises during program development: the lines after the insertion point will not have to be renumbered, and references to them (in GOTO and GOSUB commands) will not have to be changed.

Line numbers thus represent not just an organizational scheme, but also an interactive affordance developed in a particular context.

### {SPACE}

The space between the line number 10 and the keyword PRINT is actually optional, as are all of the spaces in this program. The variant line `10PRINTCHR$(205.5+RND(1));:GOTO10` will function exactly as the standard `10 PRINT` with spaces does. The spaces are of course helpful to the person trying to type in this line of code correctly: they make it more legible and more understandable.

Even in this exceedingly short program, which has no variables and no comments, the presence of these optional spaces indicates some concern for the people who will deal with this code, rather than merely the machine that will process it.

### PRINT

The statement PRINT causes its argument to be displayed on the screen. When BASIC was first developed in 1964 at Dartmouth College, however, the physical interface was different. The users and programmers at Dartmouth worked not at screens but at print terminals, initially Teletypes. A PRINT command that executed successfully did actually cause something to be printed. Although BASIC was less than twenty years old when a version of it was made for the Commodore 64, that version nevertheless has a residue of history, leftover terms from before a change in the standard output technology. Video displays replaced scrolls of paper with printed output, but the keyword PRINT remained.

### CHR$

This function takes a numeric code and returns the corresponding character. The standard numerical representation of characters in the 1980s, still in wide use today, is ASCII (the American Standard Code for Information Interchange), a seven-bit code that represents 128 characters. On the Commodore 64 and previous Commodore computers, this representation was extended. The Commodore 64's character set, which had been used previously on the Commodore PET, was nicknamed **PETSCII**.

Character graphics exist as special tiles that are more graphical than typographical, more like elements of a mosaic than like pieces of type to be composed on a press.

### (

CHR$ and RND are both functions, so the keyword is followed in both cases by an argument in parentheses. CHR$ ends with the dollar sign to indicate that it is a string function (it takes a numeric argument and returns a string), while RND does not, since it is an arithmetic function.

### 205.5

All math in Commodore BASIC is done on floating point numbers (numbers with decimal places). When an integer result is needed (as it is in the case of CHR$), the conversion is done by BASIC automatically. If this value, 205.5, were to be converted into an integer directly, it would be truncated (rounded down) to become 205. If more than 0.5 and less than 1 is added to 205.5, the integer result will be 206.

This means the character printed will either be the one corresponding to 205 or the one corresponding to 206: **╱** or **╲**.

### +

This symbol indicates addition. The first number to be added is 205.5; the second is whatever value that RND returns, a value that will be between 0 and 1. Because all arithmetic is done in floating point, figuring out a simple 2 + 2 involves more number crunching and takes longer than it would if integer arithmetic was used. On the other hand, the universal use of floating point math means that an easy-to-apply, one-size-fits-all mathematical operation is provided for the programmer by BASIC.

### RND

This function returns a (more or less) random number, one which is between 0 and 1. The number returned is, more precisely, **pseudorandom**. While the sequence of numbers generated has no easily discernible pattern and is hard for a person to predict, it is actually the same sequence each time. This is not entirely a failing; the consistent quality of this "random" output allows other programs to be tested time and time again by a programmer and for their output to be compared for consistency.

### 1

When RND is given any positive value (such as this 1) as an argument, it produces a number using the current seed. This means that when RND(1) is invoked immediately after startup, or before any other invocation of RND, it will always produce the same result: **0.185564016**. The next invocation will also be the same, no matter which Commodore 64 is used or at what time, and the next will be the same, too. Since the sequence is deterministic, the pattern produced by the 10 PRINT program, when run before any other invocation of RND, is a complex-looking one that is always the same.

### ;

Using a semicolon after a string in a PRINT statement causes the next string to be printed immediately after the previous one, without a newline or any spaces between them. Although this use of the semicolon for output formatting was not original to BASIC, the semicolon was introduced very early on at Dartmouth, in version 2, a minor update that had only one other change. The semicolon here is enough to show that not only short computer programs like this one, but also the languages in which they are written, change over time.

### :

The colon separates two BASIC statements that could have been placed on different lines. The colon was introduced by Microsoft, the leading developer of microcomputer BASIC interpreters, as one of several moves to allow more code to be packed onto home computers.

### GOTO

This is an unconditional branch to the line indicated—the program's only line, line 10. The GOTO keyword and line number function here to return control to an earlier point, causing the first statement to be executed endlessly, or at least until the program is interrupted, either by a user pressing the STOP key or by shutting off the power.

GOTO, although not original to BASIC, came to be very strongly associated with BASIC. A denunciation of GOTO (Dijkstra's "Go To Statement Considered Harmful," 1968) is possibly the most-discussed document in the history of programming languages; this letter plays an important part in the move from unstructured high-level languages such as BASIC to structured languages such as ALGOL, Pascal, Ada, and today's object-oriented programming languages.

### RUN

Once a BASIC program is entered into the Commodore 64, it is set into motion, executed, by the RUN command. Until RUN is typed, the program lies dormant, full of potential but inert. RUN is therefore an essential token yet is not itself part of the program. RUN is what is needed to actualize the program.

---

## Historical Context

In the early 1980s, type-in programs were common in computer magazines. This one-liner appeared in various forms, initially in the 1982 Commodore 64 User's Guide, and later online. Programs that function exactly like this one were printed in a variety of sources in the early days of home computing.

This program sits at the intersection of:
- **Art and computation**: Generative art before the term existed
- **Accessibility**: Anyone could type it and see immediate results
- **Constraint**: Working within platform limitations produced creativity
- **Emergence**: Complex patterns from simple rules
- **Nostalgia**: Evokes the exploratory spirit of early computing

---

## The Pattern

The pattern produced by this program fills the screen with diagonal lines that form a maze-like structure. When the program runs, the characters appear one at a time, left to right and then top to bottom, and the image scrolls up by two lines each time the screen is filled. It takes about fifteen seconds for the maze to fill the screen when the program is first run; it takes a bit more than a second for each two-line jump to happen as the maze scrolls upward.

---

## Critical Code Studies

This scholarly attention—an entire book analyzing a single line of code—elevates a simple one-liner to the status of cultural artifact worthy of deep hermeneutic analysis. It demonstrates that code can be read as text, as cultural production, as historical document. **Critical Code Studies emerges from recognizing that even (especially?) the simplest code carries meaning beyond its function.**

In many ways, this extremely intense consideration of a single line of code stands opposed to current trends in the digital humanities, which have been dominated by what has been variously called distant reading (Moretti 2007), cultural analytics (Manovich 2009), or culturomics (Michel et al. 2010). These endeavors consider massive amounts of text, images, or data—say, millions of books published in English since 1800 or a million Manga pages—and identify patterns and trends that would otherwise remain hidden. This book takes the opposite approach, operating as if under a **centrifugal force, spiraling outward from a single line of text** to explore seemingly disparate aspects of culture.

---

## References

Montfort, Nick, Patsy Baudoin, John Bell, Ian Bogost, Jeremy Douglass, Mark C. Marino, Michael Mateas, Casey Reas, Mark Sample, and Noah Vawter. 2012. *10 PRINT CHR$(205.5+RND(1)); : GOTO 10*. Cambridge, MA: The MIT Press.

Raley, Rita. 2006. "Code.surface || Code.depth." *dichtung-digital* 36.

Moretti, Franco. 2007. *Graphs, Maps, Trees: Abstract Models for Literary History*. London: Verso.

Manovich, Lev. 2009. "Cultural Analytics: Visualizing Cultural Patterns in the Era of 'More Media.'" *Domus* (Milan) (September).

Michel, Jean-Baptiste, et al. 2010. "Quantitative Analysis of Culture Using Millions of Digitized Books." *Science* 331 (6014): 176–182.
