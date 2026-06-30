pub fn compute_contempt(eval_score: i16) -> i16 {
    match eval_score {
        // Tier 1: Slightly losing — seek draws, simplify
        s if s > -150 && s < 0 => -20,

        // Tier 2: Clearly losing — trust fortress detection, zero bias
        s if s > -300 && s <= -150 => 0,

        // Tier 3: Desperate — avoid draws, create chaos
        s if s <= -300 => 50,
        
        // Winning or equal
        _ => 0,
    }
}
