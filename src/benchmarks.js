// The 25 benchmark WODs named in docs/reference/CrossFit_Complete_Movement_Library.pdf.
// The PDF lists only movements, so rep schemes and Rx loads are the standard published versions.
// load: {lb, kg} = Rx (first value of the usual pair); the athlete can change any of it (then it counts as Scaled).

const m = (name, reps = null, load = null, extra = {}) => ({ name, reps, load, ...extra });
const run = (distance) => m('Run', null, null, { distance });

export const BENCHMARKS = [
  { name: 'Fran', format: 'For Time', movements: [m('Thruster', '21-15-9', { lb: 95, kg: 43 }), m('Pull-Up', '21-15-9')] },
  { name: 'Grace', format: 'For Time', movements: [m('Clean and Jerk', 30, { lb: 135, kg: 61 })] },
  { name: 'Isabel', format: 'For Time', movements: [m('Squat Snatch', 30, { lb: 135, kg: 61 })] },
  { name: 'Diane', format: 'For Time', movements: [m('Conventional Deadlift', '21-15-9', { lb: 225, kg: 102 }), m('Kipping Handstand Push-Up', '21-15-9')] },
  { name: 'Elizabeth', format: 'For Time', movements: [m('Squat Clean', '21-15-9', { lb: 135, kg: 61 }), m('Ring Dip', '21-15-9')] },
  { name: 'Karen', format: 'For Time', movements: [m('Wall Ball Shot', 150, { lb: 20, kg: 9 })] },
  { name: 'Annie', format: 'For Time', movements: [m('Double-Under', '50-40-30-20-10'), m('Sit-Up', '50-40-30-20-10')] },
  { name: 'Helen', format: 'RFT', rounds: 3, movements: [run('400m'), m('Russian Kettlebell Swing', 21, { lb: 53, kg: 24 }), m('Pull-Up', 12)] },
  { name: 'Jackie', format: 'For Time', movements: [m('Row', null, null, { distance: '1000m' }), m('Thruster', 50, { lb: 45, kg: 20 }), m('Pull-Up', 30)] },
  { name: 'Nancy', format: 'RFT', rounds: 5, movements: [run('400m'), m('Overhead Squat', 15, { lb: 95, kg: 43 })] },
  { name: 'Cindy', format: 'AMRAP', minutes: 20, movements: [m('Pull-Up', 5), m('Push-Up', 10), m('Air Squat', 15)] },
  { name: 'Mary', format: 'AMRAP', minutes: 20, movements: [m('Kipping Handstand Push-Up', 5), m('Pistol Squat', 10), m('Pull-Up', 15)] },
  { name: 'Chelsea', format: 'EMOM', minutes: 30, every: 1, movements: [m('Pull-Up', 5), m('Push-Up', 10), m('Air Squat', 15)] },
  { name: 'Angie', format: 'For Time', movements: [m('Pull-Up', 100), m('Push-Up', 100), m('Sit-Up', 100), m('Air Squat', 100)] },
  { name: 'Barbara', format: 'RFT', rounds: 5, note: '3 min rest between rounds',
    movements: [m('Pull-Up', 20), m('Push-Up', 30), m('Sit-Up', 40), m('Air Squat', 50)] },
  { name: 'Amanda', format: 'For Time', movements: [m('Ring Muscle-Up', '9-7-5'), m('Squat Snatch', '9-7-5', { lb: 135, kg: 61 })] },
  { name: 'Gwen', format: 'Strength', note: 'Touch-and-go sets; score = load', movements: [m('Clean and Jerk', '15-12-9')] },
  { name: 'Linda', format: 'Descending Ladder', note: 'Loads: deadlift 1.5× bodyweight, bench 1×, clean 0.75×',
    movements: [m('Conventional Deadlift', '10-9-8-7-6-5-4-3-2-1'), m('Bench Press', '10-9-8-7-6-5-4-3-2-1'), m('Squat Clean', '10-9-8-7-6-5-4-3-2-1')] },
  { name: 'Eva', format: 'RFT', rounds: 5, movements: [run('800m'), m('Russian Kettlebell Swing', 30, { lb: 70, kg: 32 }), m('Pull-Up', 30)] },
  { name: 'Kelly', format: 'RFT', rounds: 5, note: 'Box 24/20 in',
    movements: [run('400m'), m('Box Jump', 30), m('Wall Ball Shot', 30, { lb: 20, kg: 9 })] },
  { name: 'Murph', format: 'For Time', note: 'Wear a 20 lb / 9 kg vest',
    movements: [run('1 mile'), m('Pull-Up', 100), m('Push-Up', 200), m('Air Squat', 300), run('1 mile')] },
  { name: 'DT', format: 'RFT', rounds: 5, movements: [m('Conventional Deadlift', 12, { lb: 155, kg: 70 }),
    m('Hang Power Clean', 9, { lb: 155, kg: 70 }), m('Push Jerk', 6, { lb: 155, kg: 70 })] },
  { name: 'The Chief', format: 'AMRAP', minutes: 15, note: '5 × 3-min AMRAPs, 1 min rest; score = total rounds',
    movements: [m('Power Clean', 3, { lb: 135, kg: 61 }), m('Push-Up', 6), m('Air Squat', 9)] },
  { name: 'Fight Gone Bad', format: 'Intervals', minutes: 17, every: 1, note: '3 rounds, 1 min per station, 1 min rest; score = total reps',
    movements: [m('Wall Ball Shot', null, { lb: 20, kg: 9 }), m('Sumo Deadlift High Pull', null, { lb: 75, kg: 34 }), m('Box Jump'),
      m('Push Press', null, { lb: 75, kg: 34 }), m('Row', 'calories')] },
  { name: 'Filthy Fifty', format: 'For Time', movements: [m('Box Jump', 50), m('Jumping Pull-Up', 50), m('Russian Kettlebell Swing', 50, { lb: 35, kg: 16 }),
    m('Walking Lunge', 50), m('Knees-to-Elbows', 50), m('Push Press', 50, { lb: 45, kg: 20 }), m('GHD Back Extension', 50),
    m('Wall Ball Shot', 50, { lb: 20, kg: 9 }), m('Burpee', 50), m('Double-Under', 50)] },
];

// Benchmark movement names that are fine even though the library doesn't list them exactly.
export const BENCHMARK_EXTRA_NAMES = ['Pull-Up', 'Run', 'Push Press', 'Sumo Deadlift High Pull'];
