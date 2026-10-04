backdropMotionRegister("victory", {
 "still": "art/background_victory.png",
 "loopMs": 24000,
 "fps": 12,
 "effects": [
  {
   "type": "breathe",
   "layer": "art/background_victory_light.png",
   "box": [
    1246,
    184,
    1504,
    334
   ],
   "min": 0.3,
   "max": 1.5,
   "cycles": 3
  },
  {
   "type": "shimmer",
   "pattern": "bands",
   "layer": "art/background_victory_sea.png",
   "box": [
    696,
    258,
    1672,
    349
   ],
   "cell": 2,
   "ray": 0.3,
   "smoke": 0.12,
   "breath": 0.08
  },
  {
   "type": "shimmer",
   "pattern": "bands",
   "layer": "art/background_victory_mist.png",
   "box": [
    96,
    516,
    604,
    804
   ],
   "cell": 2,
   "ray": 0.08,
   "smoke": 0.34,
   "breath": 0.12
  },
  {
   "type": "breathe",
   "layer": "art/background_victory_purple.png",
   "box": [
    246,
    196,
    1665,
    884
   ],
   "min": 0.35,
   "max": 1.6,
   "cycles": 2
  },
  {
   "type": "breathe",
   "layer": "art/background_victory_word.png",
   "box": [
    740,
    43,
    933,
    196
   ],
   "min": 0.6,
   "max": 1.25,
   "cycles": 2
  },
  {
   "type": "haze",
   "layer": "art/background_victory_haze.png",
   "strength": 0.34
  },
  {
   "type": "dust",
   "count": 170,
   "drift": 26,
   "dark": 0.2,
   "lit": 0.75,
   "litLayer": "art/background_victory_haze.png",
   "zone": [
    0,
    40,
    1672,
    880
   ],
   "litZone": [
    1000,
    60,
    1672,
    460
   ],
   "unit": 2,
   "litColour": "#A9C0DC",
   "darkColour": "#7F7160"
  },
  {
   "type": "glints",
   "points": [
    [
     1378,
     290
    ],
    [
     1378,
     235
    ],
    [
     1378,
     180
    ]
   ],
   "unit": 2,
   "ms": 900,
   "perLoop": 3,
   "core": "#C9DCF2",
   "arm": "#5D85B5",
   "tip": "#30476E"
  },
  {
   "type": "pulses",
   "points": [
    [
     1493,
     342
    ],
    [
     631,
     350
    ],
    [
     610,
     362
    ],
    [
     833,
     453
    ],
    [
     1073,
     494
    ],
    [
     792,
     522
    ],
    [
     795,
     530
    ],
    [
     1335,
     602
    ],
    [
     840,
     679
    ],
    [
     1272,
     751
    ],
    [
     819,
     799
    ]
   ],
   "unit": 3,
   "cycles": 3,
   "core": "#7C44CA",
   "arm": "#492877"
  }
 ]
});
