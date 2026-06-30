use crate::move_core::Move;

pub struct VarianceTracker {
    pub prev_scores: Vec<i16>,
    pub stability: Vec<f32>,
}

impl VarianceTracker {
    pub fn new() -> Self {
        Self {
            prev_scores: Vec::new(),
            stability: Vec::new(),
        }
    }

    pub fn update(&mut self, moves: &[(Move, i16)]) {
        if self.prev_scores.len() < moves.len() {
            self.prev_scores.resize(moves.len(), 0);
            self.stability.resize(moves.len(), 0.0);
        }
        
        for (i, &(_, score)) in moves.iter().enumerate() {
            let prev = self.prev_scores[i];
            let delta = (score as i32 - prev as i32).abs() as f32;
            let s = self.stability[i];
            self.stability[i] = s * 0.6 + delta * 0.4;
            self.prev_scores[i] = score;
        }
    }

    pub fn select_stable(&self, candidates: &[(Move, i16)]) -> usize {
        if candidates.len() < 2 { return 0; }
        
        let best = candidates.iter().map(|&(_, s)| s).max().unwrap_or(0);
        let pool: Vec<usize> = candidates.iter().enumerate()
            .filter(|&(_, &(_, s))| (best as i32 - s as i32).abs() <= 20)
            .map(|(i, _)| i)
            .collect();

        if pool.len() >= 2 {
            *pool.iter()
                .min_by(|&&a, &&b| self.stability[a].partial_cmp(&self.stability[b]).unwrap())
                .unwrap()
        } else {
            candidates.iter().enumerate()
                .max_by_key(|&(_, &(_, s))| s)
                .map(|(i, _)| i).unwrap_or(0)
        }
    }
}
