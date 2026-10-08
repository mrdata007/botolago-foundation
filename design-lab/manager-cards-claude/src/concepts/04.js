/* 04 POCHOIR (bold). The spray stencil that numbers neighbourhood-tournament bibs: hand-cut
   kraft in the derb, then film, oiled manila, etched zinc and, at the top, the brass plate a
   sign shop keeps for decades. The card is the TOOL, resting on the print it makes: a 2.2:1
   bib-number plate with a round hang hole, the 84 cut through it, every cut showing the
   club-coloured print on the sheet beneath. The plate never mirrors. */
(function () {
  const MC = window.MC;

  /* "BotolaGO Pochoir", lab cut. Changa outlines (800 for the number, the name and the founder
     year; 600 for the stat line), shaped with HarfBuzz, with one stencil bridge computed for every
     enclosed counter, in Latin, Arabic and digits alike. Only the lab's fixed strings exist here:
     the ten digits, ALI, علي and the four stat labels in both scripts. Any other name is
     rubber-stamped in ink until the face is drawn (the spec's fallback).
     Entry: [path (font units, y down, baseline origin), advance, ink box, bridge centre-lines]. */
  const G = {"w800":{"0":["M40 -312Q40 -405 55 -468Q70 -532 104 -570Q139 -607 196 -624Q253 -640 338 -640Q423 -640 480 -624Q537 -607 571 -570Q605 -532 620 -469Q635 -406 635 -312Q635 -237 626 -182Q616 -127 596 -89Q575 -51 540 -28Q506 -5 456 5Q406 15 338 15Q270 15 220 4Q170 -6 136 -29Q101 -52 80 -90Q59 -128 50 -183Q40 -238 40 -312ZM255 -469V-209Q255 -177 267 -166Q279 -156 318 -156H420V-416Q420 -448 406 -458Q392 -469 351 -469Z",675,[40,-640,635,15],[[336,-465,336,-653]]],"1":["M25 0V-165H193V-444L15 -430V-610L393 -640V-165H515V0Z",535,[15,-640,515,0],[]],"2":["M35 0V-150Q35 -182 44 -209Q53 -236 74 -260Q94 -283 128 -306Q163 -328 216 -352Q268 -377 340 -406V-462Q324 -466 302 -468Q280 -469 247 -469Q209 -469 162 -464Q116 -459 73 -450L46 -608Q109 -623 175 -632Q241 -640 297 -640Q429 -640 492 -596Q555 -552 555 -460Q555 -423 548 -394Q540 -365 520 -341Q501 -317 464 -294Q428 -271 370 -244Q311 -218 225 -184V-165H545V0Z",595,[35,-640,555,0],[]],"3":["M265 14Q211 14 144 6Q77 -3 10 -18L37 -176Q78 -167 125 -162Q172 -157 214 -157Q279 -157 311 -164V-233L139 -260V-365L311 -395V-462Q282 -469 219 -469Q178 -469 132 -464Q85 -459 45 -450L18 -608Q84 -623 150 -632Q216 -640 269 -640Q400 -640 463 -601Q526 -562 526 -480Q526 -422 502 -381Q477 -340 427 -315V-310Q477 -291 502 -254Q526 -217 526 -163Q526 -103 498 -64Q470 -24 412 -5Q354 14 265 14Z",556,[10,-640,526,14],[]],"4":["M329 -107H10V-226L174 -625H529V-272H597V-107H529V0H329ZM218 -272H329V-475H301Z",627,[10,-625,597,0],[[290,-276,290,-96]]],"5":["M301 15Q232 15 166 7Q99 -1 40 -17L67 -175Q117 -165 158 -160Q200 -156 231 -156Q272 -156 298 -158Q325 -159 344 -163V-217L269 -225Q207 -231 166 -240Q125 -250 102 -266Q78 -281 68 -305Q59 -329 59 -363L69 -625H521L506 -460H269V-394L328 -387Q410 -378 461 -354Q512 -330 536 -288Q559 -247 559 -185Q559 -82 496 -34Q433 15 301 15Z",589,[40,-625,559,15],[]],"6":["M365 -257H291Q266 -257 258 -249Q250 -241 250 -215V-142H324Q349 -142 357 -150Q365 -159 365 -184ZM580 -200Q580 -124 552 -77Q524 -30 464 -8Q403 15 307 15Q233 15 181 -3Q129 -21 97 -60Q65 -98 50 -160Q35 -223 35 -312Q35 -404 52 -466Q69 -529 106 -568Q144 -606 206 -623Q268 -640 358 -640Q384 -640 423 -635Q462 -630 499 -623Q536 -616 556 -608L529 -450Q491 -458 446 -464Q400 -469 368 -469Q325 -469 296 -467Q266 -465 250 -460V-399H304Q450 -399 515 -352Q580 -305 580 -200Z",615,[35,-640,580,15],[[307,-253,307,-413]]],"7":["M287 0H82L261 -460H20L5 -625H480V-500Z",500,[5,-625,480,0],[]],"8":["M308 -640Q393 -640 448 -620Q504 -600 532 -560Q559 -520 559 -459Q559 -413 546 -376Q533 -338 510 -315V-308Q542 -289 562 -251Q581 -213 581 -171Q581 -122 566 -86Q550 -51 516 -28Q483 -6 432 4Q380 15 308 15Q236 15 184 4Q133 -6 100 -28Q66 -51 50 -86Q35 -122 35 -171Q35 -213 54 -251Q74 -289 105 -308V-315Q83 -338 70 -376Q57 -414 57 -459Q57 -520 84 -560Q112 -600 168 -620Q224 -640 308 -640ZM282 -234Q267 -240 261 -240Q250 -240 250 -223V-142H323Q349 -142 358 -148Q366 -155 366 -174V-201ZM329 -389Q335 -387 338 -386Q341 -385 345 -385Q354 -385 360 -390Q365 -396 365 -403V-483H294Q269 -483 260 -477Q252 -471 251 -451L250 -423Z",616,[35,-640,581,15],[[311,-481,311,-653],[299,-149,299,23]]],"9":["M250 -483V-410Q250 -385 258 -376Q266 -368 291 -368H365V-441Q365 -467 357 -475Q349 -483 324 -483ZM35 -425Q35 -501 64 -548Q92 -595 152 -618Q212 -640 308 -640Q382 -640 434 -622Q486 -604 518 -566Q550 -527 565 -464Q580 -402 580 -313Q580 -222 563 -159Q546 -96 508 -58Q471 -19 409 -2Q347 15 257 15Q230 15 189 10Q148 5 110 -2Q71 -10 49 -17L76 -175Q117 -167 165 -162Q213 -156 247 -156Q290 -156 320 -158Q349 -161 365 -165V-226H311Q166 -226 100 -273Q35 -320 35 -425Z",615,[35,-640,580,15],[[307,-373,307,-217]]],"ALI":["M5 0 165 -625H476L636 0H436L325 -433H316L205 0ZM122 -99V-244H519V-99ZM691 0V-625H891V-165H1081V0ZM1136 -625H1336V0H1136Z",1386,[5,-625,1336,0],[[317,-252,317,-88]]],"علي":["M436 290Q326 290 253 277Q180 264 138 236Q96 207 78 159Q60 111 60 41Q60 7 64 -27Q67 -61 75 -95Q83 -129 94 -161L250 -136Q237 -98 228 -62Q220 -26 220 11Q220 42 222 66Q224 90 229 110H510Q563 110 594 106Q626 101 640 90Q654 78 654 57V0H814V41Q814 111 796 158Q778 206 736 235Q693 264 620 277Q546 290 436 290ZM654 0Q597 0 534 -8Q471 -17 412 -34L436 -206Q488 -193 530 -186Q571 -180 614 -180H904V0ZM343 500Q327 500 307 485Q287 470 272 450Q257 429 257 414Q257 398 272 378Q286 359 306 344Q326 330 342 330Q359 330 378 344Q398 359 412 378Q427 398 427 415Q427 430 412 450Q397 470 378 485Q358 500 343 500ZM534 500Q518 500 498 485Q478 470 463 450Q448 429 448 414Q448 398 462 378Q477 359 497 344Q517 330 533 330Q550 330 570 344Q589 359 604 378Q618 398 618 415Q618 430 603 450Q588 470 568 485Q549 500 534 500ZM1174 -180H1264V0H864V-180H1014V-630H1174ZM1224 0V-180H1481L1584 0ZM1506 -296V-223Q1506 -200 1519 -190Q1532 -180 1560 -180H1806V0H1574Q1511 0 1468 -13Q1424 -26 1398 -54Q1371 -82 1358 -128Q1346 -174 1346 -240Q1346 -306 1358 -352Q1369 -397 1394 -426Q1420 -454 1462 -467Q1503 -480 1562 -480Q1597 -480 1628 -478Q1658 -476 1689 -471Q1720 -466 1754 -457L1730 -285Q1685 -293 1655 -296Q1625 -300 1592 -300Q1564 -300 1544 -299Q1524 -298 1506 -296Z",1843,[60,-630,1806,500],[]]},"w600":{"0":["M50 -312Q50 -411 62 -475Q75 -539 105 -575Q135 -611 188 -626Q242 -640 325 -640Q407 -640 460 -626Q514 -611 544 -576Q574 -540 586 -476Q598 -412 598 -312Q598 -232 590 -175Q583 -118 566 -81Q548 -44 517 -23Q486 -2 438 6Q391 15 325 15Q258 15 210 6Q163 -2 132 -24Q101 -45 83 -82Q65 -119 58 -176Q50 -232 50 -312ZM210 -513V-165Q210 -133 225 -122Q240 -112 288 -112H438V-460Q438 -492 421 -502Q404 -513 354 -513Z",648,[50,-640,598,15],[[322,-509,322,-653]]],"1":["M30 0V-123H188V-493L20 -477V-610L337 -640V-123H459V0Z",484,[20,-640,459,0],[]],"2":["M45 0V-117Q45 -156 52 -186Q60 -217 79 -242Q98 -266 134 -290Q169 -313 225 -339Q281 -365 362 -398V-506Q346 -510 324 -512Q302 -513 268 -513Q226 -513 176 -508Q125 -503 78 -494L58 -611Q111 -625 170 -632Q230 -640 286 -640Q408 -640 465 -599Q522 -558 522 -471Q522 -433 515 -404Q508 -375 488 -351Q469 -327 432 -304Q395 -281 335 -254Q275 -226 187 -190V-123H511V0Z",572,[45,-640,522,0],[]],"3":["M243 15Q189 15 130 8Q72 0 20 -14L40 -132Q81 -123 130 -118Q180 -113 225 -113Q298 -113 328 -120V-251L155 -275V-354L328 -383V-506Q300 -513 238 -513Q194 -513 144 -508Q95 -503 54 -494L35 -611Q88 -625 146 -632Q205 -640 260 -640Q376 -640 432 -600Q488 -559 488 -475Q488 -420 466 -380Q443 -339 399 -317V-312Q445 -292 466 -255Q488 -218 488 -163Q488 -100 463 -60Q438 -21 384 -3Q330 15 243 15Z",528,[20,-640,488,15],[]],"4":["M344 -123H20V-207L217 -625H493V-246H560V-123H493V0H344ZM182 -246H344V-513H311Z",600,[20,-625,560,0],[[288,-252,288,-112]]],"5":["M283 15Q220 15 160 8Q100 1 50 -14L70 -131Q119 -122 166 -117Q212 -112 250 -112Q290 -112 316 -114Q341 -115 359 -119V-231L280 -239Q216 -245 175 -254Q134 -263 111 -278Q88 -293 79 -316Q70 -338 70 -371L80 -625H486L474 -502H229V-372L288 -365Q374 -356 424 -334Q475 -313 497 -274Q519 -236 519 -174Q519 -76 462 -30Q404 15 283 15Z",559,[50,-625,519,15],[]],"6":["M384 -272H257Q226 -272 216 -264Q205 -256 205 -230V-102H332Q363 -102 374 -110Q384 -119 384 -144ZM544 -192Q544 -117 519 -72Q494 -26 439 -6Q384 15 294 15Q222 15 174 0Q125 -16 97 -52Q69 -89 57 -152Q45 -216 45 -312Q45 -407 60 -470Q74 -534 106 -571Q138 -608 194 -624Q249 -640 331 -640Q356 -640 393 -636Q430 -631 465 -625Q500 -619 519 -611L499 -494Q462 -502 414 -508Q366 -513 329 -513Q286 -513 253 -511Q220 -509 205 -505V-382H306Q431 -382 488 -337Q544 -292 544 -192Z",589,[45,-640,544,15],[[293,-269,293,-397]]],"7":["M251 0H99L290 -502H27L15 -625H453V-532Z",483,[15,-625,453,0],[]],"8":["M299 -640Q383 -640 435 -622Q487 -604 512 -565Q537 -526 537 -464Q537 -416 524 -374Q512 -333 490 -308V-301Q519 -284 536 -248Q552 -212 552 -171Q552 -118 540 -82Q527 -46 498 -24Q468 -3 420 6Q371 15 299 15Q228 15 179 6Q130 -4 100 -26Q71 -47 58 -82Q45 -118 45 -171Q45 -217 63 -258Q81 -298 109 -319V-326Q87 -347 74 -384Q61 -420 61 -464Q61 -526 86 -564Q111 -603 164 -622Q216 -640 299 -640ZM239 -268Q224 -274 217 -274Q205 -274 205 -257V-102H335Q369 -102 380 -110Q392 -117 392 -139L393 -214ZM354 -361Q359 -359 363 -358Q367 -357 371 -357Q380 -357 386 -362Q392 -368 392 -375V-523H262Q229 -523 218 -516Q206 -509 206 -486L205 -415Z",598,[45,-640,552,15],[[305,-521,305,-653],[289,-109,289,23]]],"9":["M205 -523V-396Q205 -371 214 -362Q224 -354 252 -354H384V-481Q384 -507 374 -515Q365 -523 337 -523ZM45 -433Q45 -508 70 -554Q96 -599 150 -620Q205 -640 295 -640Q367 -640 416 -624Q464 -609 492 -572Q520 -536 532 -472Q544 -409 544 -314Q544 -219 530 -156Q515 -92 482 -54Q450 -17 395 -1Q340 15 258 15Q231 15 192 10Q154 6 118 0Q81 -7 60 -14L80 -132Q119 -124 170 -118Q220 -113 259 -113Q302 -113 336 -115Q369 -117 384 -121V-244H283Q158 -244 102 -289Q45 -334 45 -433Z",589,[45,-640,544,15],[[293,-361,293,-233]]],"CAP":["M477 -11Q439 3 397 9Q355 15 299 15Q225 15 176 -1Q128 -17 100 -54Q72 -91 60 -154Q48 -217 48 -312Q48 -408 60 -472Q73 -535 103 -572Q133 -609 184 -624Q235 -640 314 -640Q339 -640 369 -637Q399 -634 426 -629Q454 -624 470 -617L451 -497Q429 -503 402 -507Q376 -511 351 -514Q326 -516 310 -516Q254 -516 231 -502Q208 -488 208 -443V-122Q231 -117 256 -114Q282 -111 307 -111Q349 -111 390 -118Q431 -124 464 -135ZM509 0 682 -625H911L1084 0H935L801 -484H792L658 0ZM613 -120V-231H981V-120ZM1313 -179V0H1164V-625H1429Q1504 -625 1550 -604Q1595 -582 1616 -534Q1636 -485 1636 -404Q1636 -286 1590 -232Q1544 -179 1444 -179ZM1313 -290H1425Q1456 -290 1468 -299Q1479 -308 1479 -332V-460Q1479 -484 1468 -493Q1456 -502 1425 -502H1313Z",1653,[48,-640,1636,15],[[1392,-297,1392,-169],[796,-241,796,-109]]],"SEL":["M57 -138Q103 -125 155 -118Q207 -110 257 -110Q282 -110 304 -111Q325 -112 354 -116V-237L261 -245Q199 -250 157 -262Q115 -274 90 -295Q65 -316 54 -349Q44 -382 44 -431Q44 -508 65 -554Q86 -600 134 -620Q183 -640 263 -640Q320 -640 374 -634Q427 -628 481 -616L462 -497Q414 -506 374 -510Q335 -514 290 -514Q261 -514 244 -513Q226 -512 205 -509V-387L297 -380Q377 -374 424 -352Q472 -331 494 -290Q515 -250 515 -184Q515 -113 490 -69Q465 -25 410 -5Q356 15 267 15Q205 15 148 8Q91 1 36 -15ZM766 -257V-123H1022V0H617V-625H1023L1004 -502H766V-368H985V-257ZM1134 0V-625H1283V-123H1494V0Z",1501,[36,-640,1494,15],[]],"TRF":["M312 -502V0H163V-502H10V-625H465V-502ZM694 -201V0H545V-625H815Q890 -625 936 -604Q981 -582 1002 -534Q1022 -485 1022 -404Q1022 -298 976 -250Q931 -201 830 -201ZM694 -313H811Q842 -313 854 -322Q865 -331 865 -355V-460Q865 -484 854 -493Q842 -502 811 -502H694ZM909 -294 1049 0H887L777 -235ZM1296 -240V0H1147V-625H1522L1504 -502H1296V-352H1482V-240Z",1537,[10,-625,1522,0],[[778,-320,778,-192]]],"CON":["M477 -11Q439 3 397 9Q355 15 299 15Q225 15 176 -1Q128 -17 100 -54Q72 -91 60 -154Q48 -217 48 -312Q48 -408 60 -472Q73 -535 103 -572Q133 -609 184 -624Q235 -640 314 -640Q339 -640 369 -637Q399 -634 426 -629Q454 -624 470 -617L451 -497Q429 -503 402 -507Q376 -511 351 -514Q326 -516 310 -516Q254 -516 231 -502Q208 -488 208 -443V-122Q231 -117 256 -114Q282 -111 307 -111Q349 -111 390 -118Q431 -124 464 -135ZM547 -312Q547 -410 560 -474Q572 -537 603 -574Q634 -610 688 -625Q741 -640 823 -640Q904 -640 958 -625Q1012 -610 1042 -574Q1073 -537 1086 -474Q1099 -410 1099 -312Q1099 -214 1086 -151Q1073 -88 1042 -52Q1012 -15 958 0Q904 15 823 15Q741 15 688 0Q634 -15 603 -52Q572 -88 560 -151Q547 -214 547 -312ZM707 -112H856Q903 -112 921 -126Q939 -140 939 -175V-513H788Q742 -513 724 -499Q707 -485 707 -450ZM1222 0V-625H1369L1559 -319Q1573 -295 1578 -281Q1584 -267 1584 -252H1590V-625H1739V0H1593L1403 -306Q1389 -330 1384 -344Q1378 -358 1377 -373H1371V0Z",1815,[48,-640,1739,15],[[820,-509,820,-653]]],"القائد":["M447 -134H537V0H447ZM20 0V-134H334Q316 -203 300 -246Q285 -290 267 -314Q249 -339 224 -348Q200 -357 166 -357Q142 -357 116 -354Q90 -351 69 -345L36 -476Q65 -483 100 -487Q134 -491 166 -491Q220 -491 260 -482Q299 -474 328 -451Q358 -428 382 -385Q406 -342 428 -274Q451 -205 477 -104V0ZM497 0V-134H652V-470H771V0ZM746 -676 828 -698V-639L596 -577V-635L636 -646Q632 -658 630 -672Q627 -687 627 -708Q627 -762 649 -792Q671 -822 710 -836Q749 -850 801 -852V-783Q775 -781 752 -776Q728 -771 706 -761V-695Q706 -679 715 -674Q724 -670 746 -676ZM942 0V-630H1061V-134H1167V0ZM1722 -135H1828V0H1722ZM1127 -134H1279Q1271 -166 1268 -198Q1264 -230 1264 -280Q1264 -335 1276 -374Q1288 -412 1315 -436Q1342 -460 1387 -471Q1432 -482 1498 -482Q1563 -482 1614 -474Q1665 -466 1722 -447V0H1127ZM1561 -134Q1585 -134 1594 -144Q1603 -153 1603 -178V-347H1433Q1408 -347 1399 -338Q1390 -328 1390 -301V-134ZM1415 -587Q1402 -587 1386 -599Q1369 -611 1357 -628Q1345 -645 1345 -657Q1345 -671 1357 -687Q1369 -703 1386 -715Q1402 -727 1414 -727Q1429 -727 1444 -715Q1460 -703 1472 -687Q1484 -671 1484 -657Q1484 -645 1472 -628Q1460 -612 1444 -600Q1428 -587 1415 -587ZM1582 -587Q1569 -587 1552 -599Q1536 -611 1524 -628Q1512 -645 1512 -657Q1512 -671 1524 -687Q1536 -703 1552 -715Q1569 -727 1581 -727Q1596 -727 1612 -715Q1627 -703 1639 -687Q1651 -671 1651 -657Q1651 -645 1639 -628Q1627 -612 1611 -600Q1595 -587 1582 -587ZM2062 0H1788V-134H1943V-630H2062ZM2233 0V-630H2352V0Z",2438,[20,-852,2352,0],[[1496,-344,1496,-496]]],"التشكيلة":["M550 -134H652V0H550ZM552 -470V0H295Q227 0 183 -10Q139 -19 115 -44Q91 -70 82 -116Q73 -162 73 -235Q73 -308 82 -354Q91 -400 115 -426Q139 -451 183 -460Q227 -470 295 -470ZM432 -336H252Q225 -336 212 -326Q199 -315 199 -292V-178Q199 -155 212 -144Q225 -134 252 -134H432ZM243 -587Q230 -587 214 -599Q197 -611 185 -628Q173 -645 173 -657Q173 -671 185 -687Q197 -703 214 -715Q230 -727 242 -727Q257 -727 272 -715Q288 -703 300 -687Q312 -671 312 -657Q312 -645 300 -628Q288 -612 272 -600Q256 -587 243 -587ZM410 -587Q397 -587 380 -599Q364 -611 352 -628Q340 -645 340 -657Q340 -671 352 -687Q364 -703 380 -715Q397 -727 409 -727Q424 -727 440 -715Q455 -703 467 -687Q479 -671 479 -657Q479 -645 467 -628Q455 -612 439 -600Q423 -587 410 -587ZM886 -134H992V0H612V-134H767V-630H886ZM1226 -134H1332V0H952V-134H1107V-470H1226ZM1081 220Q1068 220 1052 208Q1035 196 1023 179Q1011 162 1011 150Q1011 136 1023 120Q1035 104 1052 92Q1068 80 1080 80Q1095 80 1110 92Q1126 104 1138 120Q1150 136 1150 150Q1150 162 1138 178Q1126 195 1110 208Q1094 220 1081 220ZM1248 220Q1235 220 1218 208Q1202 196 1190 179Q1178 162 1178 150Q1178 136 1190 120Q1202 104 1218 92Q1235 80 1247 80Q1262 80 1278 92Q1293 104 1305 120Q1317 136 1317 150Q1317 162 1305 178Q1293 195 1277 208Q1261 220 1248 220ZM1941 -134H2046V0H1941ZM1292 0V-134H1822V-297H1503Q1451 -297 1424 -324Q1396 -352 1396 -403Q1396 -439 1408 -482Q1420 -525 1441 -570Q1462 -614 1490 -654Q1517 -695 1549 -726L1646 -673Q1623 -650 1600 -620Q1578 -590 1558 -556Q1539 -523 1526 -491Q1512 -459 1507 -431H1787Q1847 -431 1880 -417Q1913 -403 1927 -370Q1941 -336 1941 -277V0ZM2709 0Q2641 0 2598 -10Q2554 -20 2530 -44Q2507 -69 2498 -112Q2489 -156 2489 -223V-380H2608V-187Q2608 -155 2627 -144Q2646 -134 2684 -134H2807Q2813 -159 2815 -188Q2817 -218 2817 -257Q2817 -302 2810 -351Q2802 -400 2790 -451L2908 -469Q2917 -440 2924 -404Q2930 -369 2933 -332Q2936 -296 2936 -263Q2936 -161 2913 -104Q2890 -47 2840 -24Q2791 0 2709 0ZM2369 0H2280V-134H2413Q2452 -134 2470 -144Q2489 -155 2489 -187V-380H2608V-223Q2608 -156 2599 -112Q2590 -69 2565 -44Q2540 -20 2492 -10Q2445 0 2369 0ZM2280 0H2006V-134H2161V-380H2280ZM2859 -134H3042V0H2709ZM2471 -587Q2458 -587 2442 -599Q2425 -611 2413 -628Q2401 -645 2401 -657Q2401 -671 2413 -687Q2425 -703 2442 -715Q2458 -727 2470 -727Q2485 -727 2500 -715Q2516 -703 2528 -687Q2540 -671 2540 -657Q2540 -645 2528 -628Q2516 -612 2500 -600Q2484 -587 2471 -587ZM2638 -587Q2625 -587 2608 -599Q2592 -611 2580 -628Q2568 -645 2568 -657Q2568 -671 2580 -687Q2592 -703 2608 -715Q2625 -727 2637 -727Q2652 -727 2668 -715Q2683 -703 2695 -687Q2707 -671 2707 -657Q2707 -645 2695 -628Q2683 -612 2667 -600Q2651 -587 2638 -587ZM2554 -764Q2541 -764 2524 -776Q2508 -788 2496 -805Q2484 -822 2484 -834Q2484 -848 2496 -864Q2508 -880 2524 -892Q2541 -904 2553 -904Q2568 -904 2584 -892Q2599 -880 2611 -864Q2623 -848 2623 -834Q2623 -822 2611 -806Q2599 -789 2583 -776Q2567 -764 2554 -764ZM3276 -134H3382V0H3002V-134H3157V-470H3276ZM3134 -587Q3121 -587 3104 -599Q3088 -611 3076 -628Q3064 -645 3064 -657Q3064 -671 3076 -687Q3088 -703 3104 -715Q3121 -727 3133 -727Q3148 -727 3164 -715Q3179 -703 3191 -687Q3203 -671 3203 -657Q3203 -645 3191 -628Q3179 -612 3163 -600Q3147 -587 3134 -587ZM3301 -587Q3288 -587 3272 -599Q3255 -611 3243 -628Q3231 -645 3231 -657Q3231 -671 3243 -687Q3255 -703 3272 -715Q3288 -727 3300 -727Q3315 -727 3330 -715Q3346 -703 3358 -687Q3370 -671 3370 -657Q3370 -645 3358 -628Q3346 -612 3330 -600Q3314 -587 3301 -587ZM3616 0H3342V-134H3497V-630H3616ZM3787 0V-630H3906V0Z",3992,[73,-904,3906,220],[[313,-332,313,-484]]],"الانتقالات":["M219 0Q163 0 128 -22Q93 -43 76 -90Q60 -138 60 -214Q60 -263 68 -312Q76 -362 90 -404L204 -385Q192 -348 186 -314Q179 -279 179 -246Q179 -211 182 -184Q186 -158 194 -134H699V-470H818V0ZM366 -487Q353 -487 336 -499Q320 -511 308 -528Q296 -545 296 -557Q296 -571 308 -587Q320 -603 336 -615Q353 -627 365 -627Q380 -627 396 -615Q411 -603 423 -587Q435 -571 435 -557Q435 -545 423 -528Q411 -512 395 -500Q379 -487 366 -487ZM533 -487Q520 -487 504 -499Q487 -511 475 -528Q463 -545 463 -557Q463 -571 475 -587Q487 -603 504 -615Q520 -627 532 -627Q547 -627 562 -615Q578 -603 590 -587Q602 -571 602 -557Q602 -545 590 -528Q578 -512 562 -500Q546 -487 533 -487ZM1345 -430V-630H1464V-449Q1464 -409 1460 -384Q1457 -359 1446 -346Q1436 -332 1415 -325V-318Q1453 -279 1468 -243Q1483 -207 1483 -162Q1483 -69 1422 -27Q1360 15 1219 15Q1123 15 1069 -2Q1015 -19 993 -56Q971 -94 971 -156Q971 -205 982 -240Q993 -276 1023 -302Q1053 -327 1109 -347ZM1098 -119H1282Q1322 -119 1340 -134Q1357 -148 1357 -169Q1357 -183 1348 -198Q1339 -214 1322 -226L1269 -269L1098 -208ZM1182 -340 989 -497 1072 -597 1326 -389ZM1644 0V-630H1763V-134H1869V0ZM2424 -135H2530V0H2424ZM1829 -134H1981Q1973 -166 1970 -198Q1966 -230 1966 -280Q1966 -335 1978 -374Q1990 -412 2017 -436Q2044 -460 2089 -471Q2134 -482 2200 -482Q2265 -482 2316 -474Q2367 -466 2424 -447V0H1829ZM2263 -134Q2287 -134 2296 -144Q2305 -153 2305 -178V-347H2135Q2110 -347 2101 -338Q2092 -328 2092 -301V-134ZM2117 -587Q2104 -587 2088 -599Q2071 -611 2059 -628Q2047 -645 2047 -657Q2047 -671 2059 -687Q2071 -703 2088 -715Q2104 -727 2116 -727Q2131 -727 2146 -715Q2162 -703 2174 -687Q2186 -671 2186 -657Q2186 -645 2174 -628Q2162 -612 2146 -600Q2130 -587 2117 -587ZM2284 -587Q2271 -587 2254 -599Q2238 -611 2226 -628Q2214 -645 2214 -657Q2214 -671 2226 -687Q2238 -703 2254 -715Q2271 -727 2283 -727Q2298 -727 2314 -715Q2329 -703 2341 -687Q2353 -671 2353 -657Q2353 -645 2341 -628Q2329 -612 2313 -600Q2297 -587 2284 -587ZM2764 -134H2870V0H2490V-134H2645V-470H2764ZM2622 -587Q2609 -587 2592 -599Q2576 -611 2564 -628Q2552 -645 2552 -657Q2552 -671 2564 -687Q2576 -703 2592 -715Q2609 -727 2621 -727Q2636 -727 2652 -715Q2667 -703 2679 -687Q2691 -671 2691 -657Q2691 -645 2679 -628Q2667 -612 2651 -600Q2635 -587 2622 -587ZM2789 -587Q2776 -587 2760 -599Q2743 -611 2731 -628Q2719 -645 2719 -657Q2719 -671 2731 -687Q2743 -703 2760 -715Q2776 -727 2788 -727Q2803 -727 2818 -715Q2834 -703 2846 -687Q2858 -671 2858 -657Q2858 -645 2846 -628Q2834 -612 2818 -600Q2802 -587 2789 -587ZM2830 0V-134H2985V-470H3104V0ZM3045 -587Q3032 -587 3016 -599Q2999 -611 2987 -628Q2975 -645 2975 -657Q2975 -671 2987 -687Q2999 -703 3016 -715Q3032 -727 3044 -727Q3059 -727 3074 -715Q3090 -703 3102 -687Q3114 -671 3114 -657Q3114 -645 3102 -628Q3090 -612 3074 -600Q3058 -587 3045 -587ZM3631 -430V-630H3750V-449Q3750 -409 3746 -384Q3743 -359 3732 -346Q3722 -332 3701 -325V-318Q3739 -279 3754 -243Q3769 -207 3769 -162Q3769 -69 3708 -27Q3646 15 3505 15Q3409 15 3355 -2Q3301 -19 3279 -56Q3257 -94 3257 -156Q3257 -205 3268 -240Q3279 -276 3309 -302Q3339 -327 3395 -347ZM3384 -119H3568Q3608 -119 3626 -134Q3643 -148 3643 -169Q3643 -183 3634 -198Q3625 -214 3608 -226L3555 -269L3384 -208ZM3468 -340 3275 -497 3358 -597 3612 -389ZM3930 0V-630H4049V0Z",4135,[60,-727,4049,15],[[2196,-345,2196,-497],[1224,-125,1224,23],[3512,-125,3512,23]]],"الثبات":["M219 0Q163 0 128 -22Q93 -43 76 -90Q60 -138 60 -214Q60 -263 68 -312Q76 -362 90 -404L204 -385Q192 -348 186 -314Q179 -279 179 -246Q179 -211 182 -184Q186 -158 194 -134H699V-470H818V0ZM366 -487Q353 -487 336 -499Q320 -511 308 -528Q296 -545 296 -557Q296 -571 308 -587Q320 -603 336 -615Q353 -627 365 -627Q380 -627 396 -615Q411 -603 423 -587Q435 -571 435 -557Q435 -545 423 -528Q411 -512 395 -500Q379 -487 366 -487ZM533 -487Q520 -487 504 -499Q487 -511 475 -528Q463 -545 463 -557Q463 -571 475 -587Q487 -603 504 -615Q520 -627 532 -627Q547 -627 562 -615Q578 -603 590 -587Q602 -571 602 -557Q602 -545 590 -528Q578 -512 562 -500Q546 -487 533 -487ZM989 0V-630H1108V-134H1214V0ZM1448 -134H1554V0H1174V-134H1329V-470H1448ZM1389 220Q1376 220 1360 208Q1343 196 1331 179Q1319 162 1319 150Q1319 136 1331 120Q1343 104 1360 92Q1376 80 1388 80Q1403 80 1418 92Q1434 104 1446 120Q1458 136 1458 150Q1458 162 1446 178Q1434 195 1418 208Q1402 220 1389 220ZM1788 -134H1894V0H1514V-134H1669V-470H1788ZM1646 -587Q1633 -587 1616 -599Q1600 -611 1588 -628Q1576 -645 1576 -657Q1576 -671 1588 -687Q1600 -703 1616 -715Q1633 -727 1645 -727Q1660 -727 1676 -715Q1691 -703 1703 -687Q1715 -671 1715 -657Q1715 -645 1703 -628Q1691 -612 1675 -600Q1659 -587 1646 -587ZM1813 -587Q1800 -587 1784 -599Q1767 -611 1755 -628Q1743 -645 1743 -657Q1743 -671 1755 -687Q1767 -703 1784 -715Q1800 -727 1812 -727Q1827 -727 1842 -715Q1858 -703 1870 -687Q1882 -671 1882 -657Q1882 -645 1870 -628Q1858 -612 1842 -600Q1826 -587 1813 -587ZM1729 -764Q1716 -764 1700 -776Q1683 -788 1671 -805Q1659 -822 1659 -834Q1659 -848 1671 -864Q1683 -880 1700 -892Q1716 -904 1728 -904Q1743 -904 1758 -892Q1774 -880 1786 -864Q1798 -848 1798 -834Q1798 -822 1786 -806Q1774 -789 1758 -776Q1742 -764 1729 -764ZM2128 0H1854V-134H2009V-630H2128ZM2299 0V-630H2418V0Z",2504,[60,-904,2418,220],[]]}};
  const UPM = 1000;

  const PW = 352;
  const PH = 160;
  const PR = 6;
  const HANG = { cx: 318, cy: 34, r: 21 }; // see-through hang hole, 12% of the width
  const NOTCH = { x: 314, w: 8, h: 8 }; // founder: the cutter's notch, under the cut '26'
  const PAPER = "#f4f1e8";
  const NAVY = "#0c3164";
  const r2 = (n) => Math.round(n * 100) / 100;
  const esc = (s) => MC.esc(s);

  /* ------------------------------------------------------------ colour */
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
  const lum = (h) =>
    rgb(h)
      .map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  /** The club colour as print ink: deepened toward black until it reads 4.5:1 on the plate. */
  function inkOn(club, ground) {
    for (let t = 0; t <= 1.001; t += 0.05) {
      const c = mix(club, "#0a0d12", t);
      if (contrast(c, ground) >= 4.5) return c;
    }
    return NAVY;
  }

  /* ------------------------------------------------------------ tiers */
  // n = registration holes (the tier count), bf = bridge factor, wall/lip = cut-wall widths
  const TIER = {
    HOMA: { n: 0, plate: "#b59b78", bf: 1.5, wall: 2.6, wallC: "#2b1b08", wallO: 0.5, lip: 2.2, lipC: "FLUTE", edge: "#7a6448", lettering: "marker" },
    STADE: { n: 1, plate: "#d7e2ea", film: 0.55, bf: 1, wall: 0.9, wallC: "#1d3047", wallO: 0.38, lip: 0.8, lipC: "#ffffff", edge: "#5d7590", lettering: "print" },
    PRO: { n: 2, plate: "#c9a266", bf: 1, wall: 2, wallC: "#3a2408", wallO: 0.5, lip: 1, lipC: "#f6e9c9", edge: "#7a6448", lettering: "stamp" },
    CHAMPION: { n: 3, plate: "#a7afb8", bf: 0.85, wall: 1.6, wallC: "#161c22", wallO: 0.5, lip: 1, lipC: "#f4f7fa", edge: "#5f6873", thick: 1.5, body: "#5c646e", lettering: "engrave", engr: "#2a3038" },
    LEGEND: { n: 3, plate: "#d4af5e", bf: 0, wall: 2.6, wallC: "#3a2706", wallO: 0.55, lip: 1.1, lipC: "#fff3cf", edge: "#7d5f22", thick: 3, body: "#7a5b1f", lettering: "engrave", engr: "#4a3410", clamps: true },
  };
  const tierOf = (p) => (TIER[p.tier] ? p.tier : "PRO");
  const groundOf = (t) => (t.film ? mix(PAPER, t.plate, t.film) : t.plate);
  const regYs = (n) => (n === 1 ? [80] : n === 2 ? [65, 95] : n === 3 ? [50, 80, 110] : []);

  /* ------------------------------------------------------------ geometry */
  function plateD(founder) {
    return (
      `M${PR} 0H${PW - PR}A${PR} ${PR} 0 0 1 ${PW} ${PR}V${PH - PR}A${PR} ${PR} 0 0 1 ${PW - PR} ${PH}` +
      (founder ? `H${NOTCH.x + NOTCH.w}V${PH - NOTCH.h}H${NOTCH.x}V${PH}` : "") +
      `H${PR}A${PR} ${PR} 0 0 1 0 ${PH - PR}V${PR}A${PR} ${PR} 0 0 1 ${PR} 0Z`
    );
  }
  const circle = (cx, cy, r) => `M${r2(cx - r)} ${cy}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0Z`;
  // the see-through holes (no print behind them): the hang hole and the registration holes
  const throughD = (t) => circle(HANG.cx, HANG.cy, HANG.r) + regYs(t.n).map((y) => circle(10, y, 3.6)).join("");

  /* ------------------------------------------------------------ type */
  function glyphRun(keys, w, gap = 0) {
    let x = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    const items = [];
    for (const k of keys) {
      const g = G[w][k];
      if (!g) return null;
      items.push({ g, dx: x });
      x0 = Math.min(x0, x + g[2][0]);
      x1 = Math.max(x1, x + g[2][2]);
      x += g[1] + gap;
    }
    return { items, x0, x1 };
  }
  const digitsRun = (s, w, gap = -12) => glyphRun([...String(s)], w, gap);
  /** Places a run: returns cut paths and bridge centre-lines in plate units. align: start | end | mid (by ink). */
  function place(run, x, y, fs, align = "start") {
    const s = fs / UPM;
    const ox = align === "end" ? x - run.x1 * s : align === "mid" ? x - ((run.x0 + run.x1) / 2) * s : x - run.x0 * s;
    let paths = "";
    const br = [];
    for (const it of run.items) {
      const tx = ox + it.dx * s;
      paths += `<path transform="translate(${r2(tx)} ${r2(y)}) scale(${r2(s * 10000) / 10000})" d="${it.g[0]}"/>`;
      for (const b of it.g[3]) br.push([tx + b[0] * s, y + b[1] * s, tx + b[2] * s, y + b[3] * s]);
    }
    return { paths, br, x0: ox + run.x0 * s, x1: ox + run.x1 * s };
  }
  const bridgeW = (fs, t) => (t.bf ? Math.max(1.1, Math.min(4, fs * 0.027)) * t.bf : 0);
  const lines = (br, w) => (w ? br.map((b) => `<path fill="none" stroke-width="${r2(w)}" d="M${r2(b[0])} ${r2(b[1])}L${r2(b[2])} ${r2(b[3])}"/>`).join("") : "");

  // measuring for the stamped fallback name (any name the lab cut does not cover)
  let ctx2d = null;
  function textW(font, text, est) {
    try {
      if (document.fonts && document.fonts.check(font, text)) {
        ctx2d = ctx2d || document.createElement("canvas").getContext("2d");
        ctx2d.font = font;
        return ctx2d.measureText(text).width;
      }
    } catch (e) {
      /* the estimate stands in */
    }
    return est;
  }

  /* ------------------------------------------------------------ what is cut */
  // Everything cut through the plate, for one render: the 84, the name, the avatar ring, the
  // founder '26' and the stat line, plus the bridges that hold their counters.
  function cuts(p, o, tk, thumb) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const t = TIER[tk];
    let paths = "";
    let small = ""; // the stat line: thin walls, so small lettering keeps its strokes
    let br = [];
    let brExtra = ""; // bridges drawn in another coordinate space (the avatar seams)
    let stamped = ""; // a name the lab face cannot cut is rubber-stamped instead

    // the number: 150u, cap 96u, start x26, baseline y128 (3 digits at 82%)
    const ovr = String(p.ovr);
    const fsN = ovr.length > 2 ? 123 : 150;
    const n = place(digitsRun(ovr, "w800"), 26, 128, fsN);
    paths += n.paths;
    br = br.concat(n.br.map((b) => [...b, bridgeW(fsN, t)]));

    // the name: 34u at x212 (Arabic: right-aligned at x290), fitted into 76u
    const name = MC.nameOf(p, o);
    const run = glyphRun([name], "w800");
    if (run) {
      // Arabic sits a little higher and smaller, so a descending yeh clears the avatar ring
      const fs0 = ar ? 32 : 34;
      const box = ar ? 72 : 76;
      const w = ((run.x1 - run.x0) * fs0) / UPM;
      const fs = w > box ? Math.max(20, (fs0 * box) / w) : fs0;
      const nm = place(run, ar ? 286 : 212, ar ? 70 : 76, fs, ar ? "end" : "start");
      paths += nm.paths;
      br = br.concat(nm.br.map((b) => [...b, bridgeW(fs, t)]));
    } else {
      const font = ar ? MC.AR_DISPLAY : '"Changa", sans-serif';
      const w = textW(`800 34px ${ar ? "Changa" : "Changa"}`, name, name.length * (ar ? 17 : 20));
      const fit = w > 76 ? ` textLength="76" lengthAdjust="spacingAndGlyphs"` : "";
      stamped = `<text x="${ar ? 290 : 212}" y="76" font-family='${font}' font-weight="800" font-size="${w > 76 ? 30 : 34}"${ar ? ' direction="rtl"' : ""}${fit}>${esc(name)}</text>`;
    }

    // the avatar: a cut ring holding the shared figure (hood up), cropped off-centre, its hood
    // seam and rim kept as bridges (the ring is the app's avatar disc, made as a tool)
    const RC = { cx: 232, cy: 108 };
    paths += `<path fill-rule="evenodd" d="${circle(RC.cx, RC.cy, 20)}M${RC.cx - 16.6} ${RC.cy}a16.6 16.6 0 1 1 33.2 0a16.6 16.6 0 1 1 -33.2 0Z"/>`;
    const A = MC.AVATAR;
    const fsA = 0.152;
    const ftx = RC.cx - 3.2 - 100 * fsA;
    const fty = RC.cy - 12.2 - 44 * fsA;
    const figT = `translate(${r2(ftx)} ${r2(fty)}) scale(${fsA})`;
    paths += `<g clip-path="url(#${o._u("fc")})"><path transform="${figT}" d="${A.torso}"/><path transform="${figT}" d="${A.hood || A.head}"/></g>`;
    const bwS = t.bf ? Math.max(1.3, bridgeW(34, t)) : 0.9; // LEGEND: the seams float, held by the mesh
    if (t.bf) {
      br.push([RC.cx - 21, RC.cy, RC.cx - 15.8, RC.cy, bwS], [RC.cx + 15.8, RC.cy, RC.cx + 21, RC.cy, bwS]);
    }
    // the hood's rim stays as a bridge: hood and shoulders read as a person seen from behind
    brExtra += `<path fill="none" transform="${figT}" stroke-width="${r2(bwS / fsA)}" d="${A.hood ? A.hoodRim : "M68 168C82 161 118 161 132 168"}"/>`;
    const clip = `<clipPath id="${o._u("fc")}"><circle cx="${RC.cx}" cy="${RC.cy}" r="14.2"/></clipPath>`;

    // founder: '26' cut at 30u under the hang hole
    if (p.founder) {
      const yr = String(p.founder).slice(-2);
      const f = place(digitsRun(yr, "w800", -10), HANG.cx, 126, 30, "mid");
      paths += f.paths;
      br = br.concat(f.br.map((b) => [...b, bridgeW(30, t)]));
    }

    // the stat line: one row of cuts at 13u, x26–306, right to left in Arabic, digits LTR
    if (!thumb) {
      const fs = 13;
      const s = fs / UPM;
      const groups = MC.STATS.map((k) => {
        const lab = glyphRun([S.stats[k]], "w600");
        const num = digitsRun(p.stats[k], "w600", -8);
        const wl = (lab.x1 - lab.x0) * s;
        const wn = (num.x1 - num.x0) * s;
        return { lab, num, wl, wn, w: wl + wn + 3.6 };
      });
      const total = groups.reduce((a, g) => a + g.w, 0);
      const gap = (306 - 26 - total) / 3;
      let x = ar ? 306 : 26;
      for (const g of groups) {
        if (ar) {
          const l = place(g.lab, x, 150, fs, "end");
          const m = place(g.num, x - g.wl - 3.6, 150, fs, "end");
          small += l.paths + m.paths;
          br = br.concat([...l.br, ...m.br].map((b) => [...b, bridgeW(fs, t)]));
          x -= g.w + gap;
        } else {
          const l = place(g.lab, x, 150, fs);
          const m = place(g.num, x + g.wl + 3.6, 150, fs);
          small += l.paths + m.paths;
          br = br.concat([...l.br, ...m.br].map((b) => [...b, bridgeW(fs, t)]));
          x += g.w + gap;
        }
      }
    }

    const brs = (t.bf ? br.map((b) => lines([b], b[4])).join("") : "") + brExtra;
    return { paths, small, brs, clip, stamped };
  }

  /* ------------------------------------------------------------ full card */
  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tk = tierOf(p);
    const t = TIER[tk];
    const legend = tk === "LEGEND";
    const thumb = !!o.thumb;
    const id = MC.uid("c04");
    const u = (k) => `${id}-${k}`;
    const url = (k) => `url(#${u(k)})`;
    const PLATE = plateD(p.founder);
    const THR = throughD(t);
    const ground = groundOf(t);
    const ink = inkOn(p.club && p.club.primary ? p.club.primary : NAVY, ground);
    const C = cuts(p, { ...o, _u: u }, tk, thumb);
    const BOX = `x="-30" y="-30" width="412" height="220"`;
    const FBOX = `filterUnits="userSpaceOnUse" ${BOX} color-interpolation-filters="sRGB"`;
    const MBOX = `maskUnits="userSpaceOnUse" ${BOX}`;
    const R = (fill, extra = "") => `<rect x="-6" y="-6" width="${PW + 12}" height="${PH + 12}" fill="${fill}"${extra}/>`;
    // example coats: ALI has no completed season; the LEGEND preview shows the build-up, labelled
    const exampleCoats = o.seasons == null && legend && !thumb;
    const seasons = o.seasons != null ? o.seasons : exampleCoats ? 3 : 0;

    /* ---- the cut set and its masks (defined once, in the print layer) ---- */
    let defs = C.clip + `<g id="${u("cuts")}"><g id="${u("big")}">${C.paths}</g><g id="${u("small")}">${C.small}</g></g><g id="${u("brs")}">${C.brs}</g>`;
    const H = (fill, stroke) => `<use href="#${u("cuts")}" fill="${fill}"/><use href="#${u("brs")}" stroke="${stroke}"/>`;
    defs += `<mask id="${u("H")}" ${MBOX}>${H("#fff", "#000")}</mask>`;
    defs += `<mask id="${u("M")}" ${MBOX}><path d="${PLATE}" fill="#fff"/><path d="${THR}" fill="#000"/>${H("#000", "#fff")}</mask>`;
    defs += `<mask id="${u("TH")}" ${MBOX}><path d="${PLATE}" fill="#fff"/><path d="${THR}" fill="#000"/></mask>`;
    const shifted = (d, ds) =>
      `<g mask="${url("H")}">${R("#fff")}` +
      `<g transform="translate(${d} ${d})"><use href="#${u("big")}" fill="#000"/><use href="#${u("brs")}" stroke="#fff"/></g>` +
      `<g transform="translate(${ds} ${ds})"><use href="#${u("small")}" fill="#000"/><use href="#${u("brs")}" stroke="#fff"/></g></g>`;
    defs += `<mask id="${u("WM")}" ${MBOX}>${shifted(t.wall, r2(Math.min(0.6, t.wall * 0.4)))}</mask><mask id="${u("LM")}" ${MBOX}>${shifted(-t.lip, -0.45)}</mask>`;

    /* ---- the print beneath: paper, and the cut shapes sprayed in the club's ink ---- */
    let shadow = "";
    if (!thumb) {
      defs += `<filter id="${u("sh")}" ${FBOX}><feGaussianBlur stdDeviation="3.2"/></filter>`;
      shadow = `<path d="${PLATE}" class="c04-shadow" transform="translate(0 3.5)" filter="${url("sh")}"/>`;
    }
    // (the share lays the plate beside its print: then its cuts are open and show the floor)
    const printSvg =
      `<svg class="c04-svg" viewBox="0 0 ${PW} ${PH}" aria-hidden="true" focusable="false"><defs>${defs}</defs>` +
      (o._noPrint ? "" : shadow + `<path d="${PLATE}" fill="${PAPER}" mask="${url("TH")}"/>` + R(ink, ` mask="${url("H")}"`)) +
      `</svg>`;

    /* ---- the plate ---- */
    let pdefs = "";
    let face = "";
    const tex = !thumb;
    if (tk === "HOMA") {
      // fresh kraft board: directional fibres, nothing worn
      if (tex)
        pdefs += `<filter id="${u("fib")}" ${FBOX}><feTurbulence type="fractalNoise" baseFrequency=".035 .75" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 .27  0 0 0 0 .19  0 0 0 0 .09  0 0 0 2.4 -1"/></filter>` +
          `<filter id="${u("fibL")}" ${FBOX}><feTurbulence type="fractalNoise" baseFrequency=".03 .6" numOctaves="2" seed="17"/><feColorMatrix values="0 0 0 0 .93  0 0 0 0 .86  0 0 0 0 .72  0 0 0 2.4 -1.05"/></filter>`;
      pdefs += `<pattern id="${u("FLUTE")}" width="2.2" height="10" patternUnits="userSpaceOnUse"><rect width="2.2" height="10" fill="#d8c29c"/><rect width=".9" height="10" fill="#8a6f49"/></pattern>`;
      face = R(t.plate) + (tex ? R("#000", ` filter="${url("fib")}" opacity=".1"`) + R("#000", ` filter="${url("fibL")}" opacity=".1"`) : "");
    } else if (tk === "STADE") {
      // clear acetate over the paper: the print shows through the film as well as the cuts
      face = R(t.plate, ` opacity="${t.film}"`) + `<path d="M228 -6L176 166" stroke="#fff" stroke-width="5" opacity=".22"/><path d="M236 -6L184 166" stroke="#fff" stroke-width="1.2" opacity=".55"/>`;
    } else if (tk === "PRO") {
      // oiled manila: slow mottling where the oil soaked in, a faint sheen
      if (tex)
        pdefs += `<filter id="${u("oil")}" ${FBOX}><feTurbulence type="fractalNoise" baseFrequency=".013" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 .36  0 0 0 0 .2  0 0 0 0 .04  0 0 0 1.7 -.66"/></filter>` +
          `<filter id="${u("grain")}" ${FBOX}><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="8"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .26  0 0 0 0 .08  0 0 0 2.2 -1.3"/></filter>`;
      pdefs += `<linearGradient id="${u("sheen")}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2cc" stop-opacity=".22"/><stop offset=".5" stop-color="#fff2cc" stop-opacity="0"/><stop offset="1" stop-color="#3a2000" stop-opacity=".14"/></linearGradient>`;
      face = R(t.plate) + (tex ? R("#000", ` filter="${url("oil")}" opacity=".3"`) + R("#000", ` filter="${url("grain")}" opacity=".22"`) : "") + R(url("sheen"));
    } else if (tk === "CHAMPION") {
      // etched zinc: a cool satin face with a fine acid grain
      pdefs += `<linearGradient id="${u("zn")}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#c3cad2"/><stop offset=".55" stop-color="#a7afb8"/><stop offset="1" stop-color="#959ea8"/></linearGradient>`;
      if (tex) pdefs += `<filter id="${u("etch")}" ${FBOX}><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="21"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .23  0 0 0 0 .27  0 0 0 2.6 -1.45"/></filter>`;
      face = R(url("zn")) + (tex ? R("#000", ` filter="${url("etch")}" opacity=".32"`) : "");
    } else {
      // polished brass, laser-cut: a warm face and two clean reflections
      pdefs += `<linearGradient id="${u("br")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3c27a"/><stop offset=".55" stop-color="#d1aa55"/><stop offset="1" stop-color="#c49a45"/></linearGradient>`;
      face = R(url("br")) + `<path d="M-6 54L358 22V40L-6 72Z" fill="#fff4d2" opacity=".32"/><path d="M-6 80L358 48V52L-6 84Z" fill="#fff4d2" opacity=".3"/>`;
    }

    // coats of overspray: one stepped band per completed season, on the border only
    let coats = "";
    if (seasons > 0) {
      const cc = [p.club && p.club.primary ? p.club.primary : NAVY, NAVY, "#1f1d1a"];
      const outer = `M${PR} 0H${PW - PR}A${PR} ${PR} 0 0 1 ${PW} ${PR}V${PH - PR}A${PR} ${PR} 0 0 1 ${PW - PR} ${PH}H${PR}A${PR} ${PR} 0 0 1 0 ${PH - PR}V${PR}A${PR} ${PR} 0 0 1 ${PR} 0Z`;
      for (let i = Math.min(seasons, 6) - 1; i >= 0; i--)
        coats += `<path d="${outer}" fill="none" stroke="${cc[i % 3]}" stroke-width="${8 * (i + 1)}" opacity=".3"/>`;
    }

    // lettering on the plate: tier and season, the ID and the country, each in the tier's craft
    let letters = "";
    if (!thumb) {
      const style = t.lettering;
      const inkC = style === "marker" ? "#1f1b17" : style === "engrave" ? t.engr : NAVY;
      if (style === "stamp" || style === "marker") pdefs += `<filter id="${u("stamp")}" ${FBOX}><feTurbulence type="fractalNoise" baseFrequency="${style === "marker" ? ".5" : ".9"}" numOctaves="2" seed="6" result="n"/><feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4 ${style === "marker" ? 3.4 : 2.9}" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/></filter>`;
      const fx = style === "stamp" || style === "marker" ? ` filter="${url("stamp")}"` : "";
      const engrave = (svg) => (style === "engrave" ? `<g transform="translate(0 .65)" fill="${tk === "LEGEND" ? "#fff3cf" : "#eef2f6"}" opacity=".85">${svg}</g>` : "");
      const tierWord = S.tiers[tk];
      const rot = style === "marker" ? -3 : style === "stamp" ? -2 : 0;
      const tierFace = style === "marker" ? `font-family="Changa" font-weight="700" font-size="13.5"` : `font-family="Manrope" font-weight="800" font-size="11" letter-spacing="1.1"`;
      const head = ar
        ? `<text x="290" y="31" direction="rtl" text-anchor="start" font-family="${style === "marker" ? "Changa" : "Noto Sans Arabic"}" font-weight="700" font-size="12.5">${esc(tierWord)}</text>` +
          `<text x="290" y="43.5" text-anchor="end" font-family="Manrope" font-weight="700" font-size="8" style="font-variant-numeric:tabular-nums">${esc(p.season)}</text>`
        : `<text x="212" y="31" ${tierFace}>${esc(tierWord)}</text>` +
          `<text x="212.5" y="43.5" font-family="Manrope" font-weight="700" font-size="8" letter-spacing=".3" style="font-variant-numeric:tabular-nums">${esc(p.season)}</text>`;
      const headG = `<g transform="rotate(${rot} ${ar ? 270 : 230} 36)">${head}</g>`;
      const idBlock =
        `<text x="${HANG.cx}" y="71" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="8" letter-spacing=".25" style="font-variant-numeric:tabular-nums">${esc(p.id)}</text>` +
        (ar
          ? `<text x="${HANG.cx}" y="83.5" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="8.5">${esc(S.country)}</text>`
          : `<text x="${HANG.cx}" y="82" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="7" letter-spacing="1.1">${esc(S.country)}</text>`);
      const idG = `<g transform="rotate(${rot ? -1 : 0} ${HANG.cx} 76)">${idBlock}</g>`;
      let note = "";
      if (exampleCoats)
        note = ar
          ? `<text x="26" y="19" direction="rtl" text-anchor="end" font-family="Noto Sans Arabic" font-weight="700" font-size="7.5">مثال · 3 مواسم</text>`
          : `<text x="26" y="18.5" font-family="Manrope" font-weight="800" font-size="6.5" letter-spacing=".9">EXEMPLE · 3 SAISONS</text>`;
      const all = headG + idG + note + C.stamped;
      letters = engrave(all) + `<g fill="${inkC}"${fx}${style === "marker" ? "" : ' opacity=".92"'}>${all}</g>`;
    } else if (C.stamped) {
      letters = `<g fill="${NAVY}">${C.stamped}</g>`;
    }

    // body thickness (metal): the plate shape, offset down and to the end, under the face
    const body = t.thick ? `<g transform="translate(${r2(t.thick * 0.35)} ${t.thick})"><path d="${PLATE}" fill="${t.body}" mask="${url("TH")}"/></g>` : "";
    // the cut walls: shadow on the top/start edges of every cut, a lit lip on the bottom/end
    const walls =
      R(t.wallC, ` mask="${url("WM")}" opacity="${t.wallO}"`) +
      R(t.lipC === "FLUTE" ? url("FLUTE") : t.lipC, ` mask="${url("LM")}" opacity="${t.lipC === "FLUTE" ? 0.95 : 0.85}"`);
    // the through-holes: a clean punched rim
    pdefs += `<linearGradient id="${u("rim")}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".75"/></linearGradient>`;
    const rims = [`<circle cx="${HANG.cx}" cy="${HANG.cy}" r="${HANG.r - 0.9}"/>`, ...regYs(t.n).map((y) => `<circle cx="10" cy="${y}" r="2.7"/>`)].join("");
    const rimG = `<g fill="none" stroke="${url("rim")}" stroke-width="1.8">${rims}</g>`;
    // LEGEND: bridgeless, the counters float on the frame's fine screen mesh, seen only in the cuts
    let mesh = "";
    if (legend && !thumb) {
      pdefs += `<pattern id="${u("mesh")}" width="1.8" height="1.8" patternUnits="userSpaceOnUse" patternTransform="rotate(22)"><rect width=".26" height="1.8" fill="#fbefc6"/><rect width="1.8" height=".26" fill="#fbefc6"/></pattern>`;
      mesh = R(url("mesh"), ` mask="${url("H")}" opacity=".32"`);
    }
    const edge = `<path d="${PLATE}" fill="none" class="c04-edge" stroke="${t.edge}" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="${THR}" fill="none" class="c04-edge" stroke="${t.edge}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;

    const plateSvg =
      `<svg class="c04-svg" viewBox="0 0 ${PW} ${PH}" aria-hidden="true" focusable="false">` +
      (pdefs ? `<defs>${pdefs}</defs>` : "") +
      body +
      `<g mask="${url("M")}">${face}${coats}${letters}</g>` +
      walls +
      mesh +
      rimG +
      edge +
      `</svg>`;

    // LEGEND: the screen-print frame's two hinge clamps protrude from the top edge
    let frame = "";
    if (t.clamps) {
      const clamp = (x) =>
        `<g transform="translate(${x} 0)"><rect x="0" y="-12" width="36" height="19" rx="2.4" fill="url(#${u("st")})" stroke="#3d454f" stroke-width=".8"/>` +
        `<rect x="2.4" y="-10.3" width="31.2" height="2.4" rx="1.2" fill="#f4f7fa" opacity=".75"/><circle cx="18" cy="-.5" r="3.6" fill="#6f7882" stroke="#2f363e" stroke-width=".7"/><path d="M15.6 -.5H20.4M18 -2.9V1.9" stroke="#e6ebf0" stroke-width=".8"/></g>`;
      frame =
        `<svg class="c04-svg c04-frame" viewBox="0 0 ${PW} ${PH}" aria-hidden="true" focusable="false"><defs><linearGradient id="${u("st")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d5dbe1"/><stop offset=".5" stop-color="#9aa3ad"/><stop offset="1" stop-color="#6f7882"/></linearGradient></defs>` +
        clamp(44) +
        clamp(152) +
        `</svg>`;
    }

    const cls = `c04 c04--${tk.toLowerCase()}${thumb ? " c04--thumb" : ""}${o.motion && !thumb ? " c04--motion" : ""}`;
    const style = o._onDark ? ` style="--c04-edgeo:0;--c04-shc:#000;--c04-sho:.55"` : "";
    return (
      `<div class="${cls}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tk}"${style}>` +
      `<div class="c04-print">${printSvg}</div>` +
      `<div class="c04-plate">${plateSvg}</div>` +
      (frame ? `<div class="c04-clamps">${frame}</div>` : "") +
      `</div>`
    );
  }

  /* ------------------------------------------------------------------ token */
  // 44–80px: a 2.2:1 plate with the 84 knocked out over the club-coloured print, the hang hole,
  // the registration holes (tier count) and the founder notch. ≤32px: the same parts, fewer and
  // bolder. No filters with noise: these render fifty times in a list.
  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    const tk = tierOf(p);
    const t = TIER[tk];
    const id = MC.uid("c04t");
    const u = (k) => `${id}-${k}`;
    const VW = 88;
    const VH = 40;
    const hpx = r2(mini ? size * 0.55 : size * 0.45);
    const rr = mini ? 3 : 2.4;
    const notch = p.founder ? (mini ? { x: 70, w: 9, h: 7 } : { x: 73, w: 7, h: 5.5 }) : null;
    const plate =
      `M${rr} 0H${VW - rr}A${rr} ${rr} 0 0 1 ${VW} ${rr}V${VH - rr}A${rr} ${rr} 0 0 1 ${VW - rr} ${VH}` +
      (notch ? `H${notch.x + notch.w}V${VH - notch.h}H${notch.x}V${VH}` : "") +
      `H${rr}A${rr} ${rr} 0 0 1 0 ${VH - rr}V${rr}A${rr} ${rr} 0 0 1 ${rr} 0Z`;
    const hang = mini ? { cx: 76.5, cy: 10.5, r: 6.2 } : { cx: 77, cy: 10, r: 5.6 };
    const dotR = mini ? 2.3 : 1.7;
    const dotX = mini ? 4.6 : 4;
    const ys = t.n === 1 ? [20] : t.n === 2 ? (mini ? [13.5, 26.5] : [14, 26]) : t.n === 3 ? (mini ? [8.5, 20, 31.5] : [10, 20, 30]) : [];
    const holes = circle(hang.cx, hang.cy, hang.r) + ys.map((y) => circle(dotX, y, dotR)).join("");
    const ovr = String(p.ovr);
    const fs = (ovr.length > 2 ? 0.8 : 1) * (mini ? 40 : 37);
    const run = digitsRun(ovr, "w800", mini ? -6 : -12);
    const x0 = mini ? 9.4 : 8.4;
    const by = VH / 2 + (0.64 * fs) / 2 - 0.2;
    const num = place(run, x0, by, fs).paths;
    const ink = inkOn(p.club && p.club.primary ? p.club.primary : NAVY, groundOf(t));
    const B = `x="-6" y="-12" width="${VW + 12}" height="${VH + 18}"`;
    const w = mini ? 1.6 : 1.5;
    const l = mini ? 0.9 : 0.8;
    let defs =
      `<g id="${u("n")}">${num}</g>` +
      `<mask id="${u("w")}" maskUnits="userSpaceOnUse" ${B}><use href="#${u("n")}" fill="#fff"/><use href="#${u("n")}" fill="#000" transform="translate(${w} ${w})"/></mask>` +
      `<mask id="${u("l")}" maskUnits="userSpaceOnUse" ${B}><use href="#${u("n")}" fill="#fff"/><use href="#${u("n")}" fill="#000" transform="translate(${-l} ${-l})"/></mask>`;
    let fill = t.plate;
    let extra = "";
    if (tk === "STADE") fill = groundOf(t);
    if (tk === "PRO") extra = `<path d="${plate}" fill="none" stroke="#e7c88c" stroke-width="${mini ? 2.2 : 1.8}" stroke-opacity=".55" clip-path="url(#${u("c")})"/>`;
    if (tk === "STADE") extra = `<path d="${plate}" fill="none" stroke="#ffffff" stroke-width="${mini ? 2.4 : 2}" stroke-opacity=".75" clip-path="url(#${u("c")})"/>`;
    if (tk === "CHAMPION") {
      defs += `<linearGradient id="${u("g")}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#c6cdd5"/><stop offset="1" stop-color="#959ea8"/></linearGradient>`;
      fill = `url(#${u("g")})`;
    }
    if (tk === "LEGEND") {
      defs += `<linearGradient id="${u("g")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c983"/><stop offset="1" stop-color="#c49a45"/></linearGradient>`;
      fill = `url(#${u("g")})`;
      extra = `<path d="M0 ${VH * 0.42}L${VW} ${VH * 0.22}V${VH * 0.34}L0 ${VH * 0.54}Z" fill="#fff4d2" opacity=".35" clip-path="url(#${u("c")})"/>`;
    }
    defs += `<clipPath id="${u("c")}"><path d="${plate}"/></clipPath>`;
    const thick = t.thick ? (mini ? 2.2 : 2) : 0;
    const body = thick ? `<path d="${plate}" fill="${t.body}" transform="translate(${r2(thick * 0.3)} ${thick})"/>` : "";
    const clamps = t.clamps
      ? `<g fill="#a9b1ba" stroke="#3d454f" stroke-width="${mini ? 0.9 : 0.7}">${(mini ? [16, 42] : [14, 44]).map((x) => `<rect x="${x}" y="${mini ? -6.5 : -5}" width="${mini ? 10 : 12}" height="${mini ? 9 : 7.5}" rx="1.2"/>`).join("")}</g>`
      : "";
    const S = MC.s(o);
    const k = hpx / VH;
    const vbW = VW + 3;
    const vbY = t.clamps ? (mini ? -7.5 : -6) : -0.5;
    const vbH = VH + (thick || 0.4) + 0.6 - vbY;
    return (
      `<span class="c04-tok c04-tok--${tk.toLowerCase()}${mini ? " c04-tok--mini" : ""}" role="img" aria-label="${esc(`${p.ovr} ${S.ovr}, ${S.tiers[tk]}${p.founder ? ", " + S.founderLine : ""}`)}">` +
      `<svg width="${r2(vbW * k)}" height="${r2(vbH * k)}" viewBox="-1 ${r2(vbY)} ${vbW} ${r2(vbH)}" aria-hidden="true" focusable="false"><defs>${defs}</defs>` +
      body +
      `<path d="${plate}${holes}" fill-rule="evenodd" fill="${fill}"/>` +
      extra +
      `<use href="#${u("n")}" fill="${ink}"/>` +
      `<rect ${B} fill="${t.wallC}" opacity="${t.wallO + 0.1}" mask="url(#${u("w")})"/>` +
      `<rect ${B} fill="${t.lipC === "FLUTE" ? "#e3cfa8" : t.lipC}" opacity=".8" mask="url(#${u("l")})"/>` +
      `<path d="${plate}${holes}" fill="none" class="c04-edge" stroke="${t.edge}" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      clamps +
      `</svg></span>`
    );
  }

  /* ------------------------------------------------------------------ row */
  // The "My position" compact card: rank, the 72px plate, the name with its founding year, points.
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tk = tierOf(p);
    return (
      `<div class="c04-row${o.me ? " is-me" : ""}" dir="${S.dir}">` +
      `<span class="c04-rk">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="c04-rtok">${token(p, { ...o, size: 72, mini: false })}</span>` +
      `<span class="c04-who"><b${ar ? ' class="ar"' : ""}>${esc(MC.nameOf(p, o))}${p.founder ? ` <i>${MC.ltr("·" + String(p.founder).slice(-2))}</i>` : ""}</b>` +
      `<small>${esc(S.tiers[tk])}</small></span>` +
      `<span class="c04-pts"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------------ share */
  // The print, on a bib: a plain mesh training bib laid flat on Tunnel Navy, the 84 and the name
  // sprayed crisp in the club's colour (with the bridges' gaps a stencil leaves), two stepped
  // halos of overspray, and the plate that made it lying beside it under one hard light.
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tk = tierOf(p);
    const t = TIER[tk];
    const id = MC.uid("c04s");
    const u = (k) => `${id}-${k}`;
    const club = p.club && p.club.primary ? p.club.primary : NAVY;
    const fabric = p.club && p.club.secondary ? p.club.secondary : "#e9e4d6";
    const ink = contrast(club, fabric) >= 3 ? club : NAVY;
    // the bib, 300 × 360, drawn flat: shoulder straps, a round neck, armholes, a straight hem
    // the bib, 296 × 358, drawn flat: broad shoulder straps, a scoop neck, shallow armholes
    const bib = "M66 0H116C120 34 132 56 150 56S180 34 184 0H234C238 40 254 64 286 72L294 76V350Q294 358 286 358H14Q6 358 6 350V76L14 72C46 64 62 40 66 0Z";
    const binding = "M116 0C120 34 132 56 150 56S180 34 184 0M66 0C62 40 46 64 14 72M234 0C238 40 254 64 286 72";
    // the sprayed print (the plate's own cut shapes, so the bridge gaps print too)
    const name = MC.nameOf(p, o);
    const nr = glyphRun([name], "w800");
    const nm = nr ? place(nr, 150, 128, 46, "mid") : null;
    const num = place(digitsRun(p.ovr, "w800"), 150, 302, 200, "mid");
    const bw = bridgeW(200, t);
    const brs = lines(num.br, bw) + (nm ? lines(nm.br, bridgeW(46, t)) : "");
    const printShapes = num.paths + (nm ? nm.paths : "");
    const nameStamp = nm ? "" : `<text x="150" y="128" text-anchor="middle" font-family="Changa" font-weight="800" font-size="46"${ar ? ' direction="rtl"' : ""}>${esc(name)}</text>`;
    const a = 2.6;
    const hw = r2(Math.sqrt(3) * a);
    const hexP = `M${r2(hw / 2)} 0L${hw} ${r2(a / 2)}V${r2(1.5 * a)}L${r2(hw / 2)} ${r2(2 * a)}L0 ${r2(1.5 * a)}V${r2(a / 2)}ZM${r2(hw / 2)} ${r2(2 * a)}V${r2(3 * a)}`;
    const shade = mix(fabric, "#000000", 0.16);
    const bg =
      `<svg class="c04-sh-bg" viewBox="0 0 360 640" aria-hidden="true" focusable="false"><defs>` +
      `<pattern id="${u("knit")}" width="${hw}" height="${r2(3 * a)}" patternUnits="userSpaceOnUse"><path d="${hexP}" fill="none" stroke="${shade}" stroke-width=".9"/></pattern>` +
      `<g id="${u("pr")}">${printShapes}${nameStamp}</g>` +
      `<mask id="${u("pm")}" maskUnits="userSpaceOnUse" x="-40" y="-40" width="380" height="440"><use href="#${u("pr")}" fill="#fff"/><g stroke="#000">${brs}</g></mask>` +
      `<clipPath id="${u("bc")}"><path d="${bib}"/></clipPath>` +
      `<filter id="${u("h1")}" x="-20%" y="-20%" width="140%" height="140%"><feMorphology operator="dilate" radius="4"/></filter>` +
      `<filter id="${u("h2")}" x="-20%" y="-20%" width="140%" height="140%"><feMorphology operator="dilate" radius="10"/></filter>` +
      `<filter id="${u("bs")}" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="6"/></filter>` +
      `</defs>` +
      `<rect width="360" height="640" fill="#001c49"/>` +
      `<g transform="translate(${ar ? 34 : 26} 96) rotate(${ar ? 2.5 : -2.5} 150 180)">` +
      `<path d="${bib}" fill="#000" opacity=".38" transform="translate(4 9)" filter="url(#${u("bs")})"/>` +
      `<path d="${bib}" fill="${fabric}"/>` +
      `<g clip-path="url(#${u("bc")})"><rect x="-10" y="-10" width="320" height="380" fill="url(#${u("knit")})" opacity=".55"/>` +
      // two stepped halos of overspray, flat, then the crisp print
      `<g fill="${ink}"><use href="#${u("pr")}" filter="url(#${u("h2")})" opacity=".1"/><use href="#${u("pr")}" filter="url(#${u("h1")})" opacity=".16"/></g>` +
      `<rect x="-10" y="-10" width="320" height="380" fill="${ink}" mask="url(#${u("pm")})"/></g>` +
      `<path d="${binding}" fill="none" stroke="${shade}" stroke-width="7" opacity=".55"/>` +
      `<path d="${binding}" fill="none" stroke="${mix(fabric, "#000000", 0.35)}" stroke-width=".9" stroke-dasharray="3 2.4" transform="translate(0 2)"/>` +
      `<path d="M6 345H294" stroke="${mix(fabric, "#000000", 0.35)}" stroke-width=".9" stroke-dasharray="3 2.4"/>` +
      `</g>` +
      `</svg>`;
    const logo = MC.logo("wordmark", { variant: "light", w: 118, label: false });
    const card = full(p, { ...o, thumb: false, motion: false, _noPrint: true, _onDark: true });
    const yr = p.founder ? String(p.founder).slice(-2) : "";
    return (
      `<div class="c04-share" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      bg +
      `<div class="c04-sh-logo">${logo}</div>` +
      `<div class="c04-sh-plate">${card}</div>` +
      `<div class="c04-sh-meta"><b${ar ? ' class="ar"' : ""}>${esc(name)}${yr ? ` <span>${MC.ltr("·" + yr)}</span>` : ""}</b>` +
      `<span class="c04-sh-tier">${esc(S.tiers[tk])}</span>` +
      `<span class="c04-sh-line"><span>${MC.ltr(p.id)}</span><span>${ar ? "مثال" : "Exemple"}</span></span></div>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------------ mount */
  // LEGEND, on the profile: the plate lifts on its hinge clamps as the pointer rises toward
  // them, showing the print beneath. Nothing moves under reduced motion.
  function mount(el) {
    if (!el || !el.classList || !el.classList.contains("c04--legend")) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const set = (e) => {
      const r = el.getBoundingClientRect();
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      el.classList.add("c04--hover");
      el.style.setProperty("--c04-lift", `${r2(48 * (1 - y))}deg`);
    };
    el.addEventListener("pointermove", set);
    el.addEventListener("pointerleave", () => {
      el.classList.remove("c04--hover");
      el.style.removeProperty("--c04-lift");
    });
  }

  MC.register({
    id: "c04",
    n: 4,
    slug: "04",
    name: "Pochoir",
    nameAr: "الإستنسل",
    category: "bold",
    philosophy: "__PHILOSOPHY__",
    philosophyAr: "__PHILOSOPHY_AR__",
    idea: [],
    belonging: [],
    founderMark: [],
    small: [],
    rtl: [],
    tiers: {},
    legend: [],
    advantages: [],
    risks: [],
    gridWidth: 320,
    detailWidth: 480,
    full,
    token,
    row,
    share,
    mount,
  });
})();
