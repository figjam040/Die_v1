backdropMotionRegister("act1", {
 "still": "art/background_act1.png",
 "loopMs": 24000,
 "fps": 12,
 "effects": [
  {
   "type": "shimmer",
   "pattern": "bands",
   "layer": "art/background_act1_light.png",
   "box": [
    684,
    84,
    997,
    795
   ],
   "cell": 2,
   "ray": 0.2,
   "smoke": 0.1,
   "breath": 0.05
  },
  {
   "type": "haze",
   "layer": "art/background_act1_haze.png",
   "strength": 0.22
  },
  {
   "type": "candles",
   "points": [
    {
     "x": 662,
     "y": 705,
     "flames": [
      [
       662,
       705
      ],
      [
       646,
       688
      ],
      [
       686,
       687
      ],
      [
       686,
       708
      ],
      [
       678,
       717
      ]
     ]
    },
    {
     "x": 1071,
     "y": 648,
     "flames": [
      [
       1071,
       648
      ]
     ]
    },
    {
     "x": 993,
     "y": 718,
     "flames": [
      [
       993,
       718
      ],
      [
       1010,
       706
      ],
      [
       1009,
       687
      ],
      [
       1021,
       712
      ]
     ]
    },
    {
     "x": 954,
     "y": 613,
     "flames": [
      [
       954,
       613
      ]
     ]
    },
    {
     "x": 711,
     "y": 604,
     "flames": [
      [
       711,
       604
      ]
     ]
    },
    {
     "x": 775,
     "y": 613,
     "flames": [
      [
       775,
       613
      ]
     ]
    },
    {
     "x": 1054,
     "y": 708,
     "flames": [
      [
       1054,
       708
      ]
     ]
    }
   ],
   "reach": 250,
   "halo": 26,
   "low": 0.15,
   "high": 1.0,
   "tip": "#FBBF24",
   "unit": 2
  },
  {
   "type": "dust",
   "count": 110,
   "drift": 16,
   "dark": 0.05,
   "lit": 0.5,
   "litLayer": "art/background_act1_haze.png",
   "zone": [
    0,
    140,
    1672,
    760
   ],
   "litZone": [
    560,
    140,
    1120,
    760
   ],
   "unit": 2,
   "litColour": "#A9C0DC",
   "darkColour": "#7F7160"
  },
  {
   "type": "glints",
   "points": [
    [
     858,
     232
    ],
    [
     863,
     328
    ],
    [
     915,
     173
    ],
    [
     913,
     240
    ],
    [
     828,
     197
    ],
    [
     930,
     260
    ],
    [
     848,
     304
    ],
    [
     872,
     334
    ],
    [
     869,
     323
    ],
    [
     859,
     330
    ],
    [
     887,
     203
    ],
    [
     862,
     243
    ],
    [
     857,
     119
    ],
    [
     854,
     411
    ]
   ],
   "unit": 2,
   "ms": 600,
   "perLoop": 1,
   "core": "#C9DCF2",
   "arm": "#5D85B5",
   "tip": ""
  },
  {
   "type": "pulses",
   "points": [
    [
     1118,
     506
    ],
    [
     62,
     446
    ]
   ],
   "unit": 2,
   "cycles": 2,
   "core": "#C13F2B",
   "arm": "#74261B"
  }
 ]
});
