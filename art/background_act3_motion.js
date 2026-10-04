backdropMotionRegister("act3", {
 "still": "art/background_act3.png",
 "loopMs": 24000,
 "fps": 12,
 "effects": [
  {
   "type": "breathe",
   "layer": "art/background_act3_core.png",
   "box": [
    711,
    65,
    958,
    312
   ],
   "min": 0.45,
   "max": 1.3,
   "cycles": 2
  },
  {
   "type": "breathe",
   "layer": "art/background_act3_threads.png",
   "box": [
    80,
    0,
    1651,
    758
   ],
   "min": 0.55,
   "max": 1.25,
   "cycles": 3
  },
  {
   "type": "shimmer",
   "pattern": "bands",
   "layer": "art/background_act3_fall.png",
   "box": [
    737,
    327,
    934,
    767
   ],
   "cell": 2,
   "ray": 0.18,
   "smoke": 0.12,
   "breath": 0.05
  },
  {
   "type": "haze",
   "layer": "art/background_act3_haze.png",
   "strength": 0.16
  },
  {
   "type": "dust",
   "count": 90,
   "drift": 14,
   "dark": 0.06,
   "lit": 0.5,
   "litLayer": "art/background_act3_haze.png",
   "zone": [
    0,
    40,
    1672,
    740
   ],
   "litZone": [
    560,
    20,
    1110,
    480
   ],
   "unit": 2,
   "litColour": "#B9A6E8",
   "darkColour": "#7F7160"
  },
  {
   "type": "glints",
   "points": [
    [
     483,
     80
    ],
    [
     615,
     175
    ],
    [
     740,
     302
    ],
    [
     934,
     304
    ],
    [
     1050,
     181
    ],
    [
     1199,
     117
    ],
    [
     1376,
     252
    ],
    [
     837,
     76
    ],
    [
     852,
     296
    ]
   ],
   "unit": 2,
   "ms": 800,
   "perLoop": 2,
   "core": "#E6DCF7",
   "arm": "#7C44CA",
   "tip": "#492877"
  },
  {
   "type": "glints",
   "points": [
    [
     394,
     134
    ],
    [
     91,
     336
    ],
    [
     1656,
     262
    ],
    [
     2,
     106
    ],
    [
     1175,
     346
    ],
    [
     1437,
     125
    ],
    [
     1480,
     234
    ],
    [
     1007,
     420
    ],
    [
     1163,
     328
    ],
    [
     219,
     418
    ],
    [
     1481,
     262
    ],
    [
     412,
     159
    ],
    [
     1482,
     253
    ],
    [
     57,
     263
    ],
    [
     212,
     80
    ],
    [
     1258,
     54
    ]
   ],
   "unit": 2,
   "ms": 1000,
   "perLoop": 1,
   "core": "#7F7160",
   "arm": "",
   "tip": ""
  }
 ]
});
