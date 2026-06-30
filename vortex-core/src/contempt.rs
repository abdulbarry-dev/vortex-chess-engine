pub fn compute_contempt(eval_score: i16) -> i16 {
    match eval_score {
        // If we are losing significantly, we want a draw (score it as 0)
        s if s <= -150 => 0,

        // If we are slightly losing, we slightly prefer playing on to drawing
        s if s < 0 => -20,
        
        // If we are equal or winning, we strongly hate draws against weaker engines (-50)
        // This ensures the engine keeps the tension and avoids early 3-fold repetitions.
        _ => -50,
    }
}
