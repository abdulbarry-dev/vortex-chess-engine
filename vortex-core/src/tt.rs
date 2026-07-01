use crate::move_core::Move;

pub const TT_EXACT: u8 = 0;
pub const TT_ALPHA: u8 = 1;
pub const TT_BETA: u8 = 2;

#[derive(Copy, Clone, Debug)]
#[repr(C)]
pub struct TTEntry {
    pub key: u64,
    pub score: i16,
    pub best_move: u16,
    pub depth: i8,
    pub bound: u8,
    pub age: u8,
}

impl Default for TTEntry {
    fn default() -> Self {
        Self {
            key: 0,
            score: 0,
            best_move: 0,
            depth: 0,
            bound: 0,
            age: 0,
        }
    }
}

pub struct TranspositionTable {
    entries: Vec<[TTEntry; 2]>,
    size: usize,
    age: u8,
}

impl TranspositionTable {
    pub fn new(size_mb: usize) -> Self {
        let entry_size = std::mem::size_of::<[TTEntry; 2]>();
        let num_entries = (size_mb * 1024 * 1024) / entry_size;
        
        let mut n = 1;
        while n <= num_entries {
            n <<= 1;
        }
        n >>= 1;

        Self {
            entries: vec![[TTEntry::default(); 2]; n],
            size: n - 1,
            age: 0,
        }
    }

    pub fn clear(&mut self) {
        for bucket in self.entries.iter_mut() {
            bucket[0] = TTEntry::default();
            bucket[1] = TTEntry::default();
        }
    }

    pub fn new_search(&mut self) {
        self.age = self.age.wrapping_add(1);
    }

    #[inline(always)]
    pub fn probe(&self, key: u64) -> Option<TTEntry> {
        let index = (key as usize) & self.size;
        let bucket = &self.entries[index];

        if bucket[0].key == key {
            return Some(bucket[0]);
        } else if bucket[1].key == key {
            return Some(bucket[1]);
        }
        None
    }

    #[inline(always)]
    pub fn store(&mut self, key: u64, depth: i8, score: i16, bound: u8, best_move: Move) {
        let index = (key as usize) & self.size;
        let bucket = &mut self.entries[index];

        let new_entry = TTEntry {
            key,
            score,
            best_move: best_move.0,
            depth,
            bound,
            age: self.age,
        };

        if bucket[0].key == key || bucket[0].key == 0 {
            bucket[0] = new_entry;
            return;
        }
        if bucket[1].key == key || bucket[1].key == 0 {
            bucket[1] = new_entry;
            return;
        }

        let replace0 = if depth > bucket[0].depth { 2 } else { self.age.wrapping_sub(bucket[0].age) as i16 };
        let replace1 = if depth > bucket[1].depth { 2 } else { self.age.wrapping_sub(bucket[1].age) as i16 };

        if replace0 >= replace1 {
            bucket[0] = new_entry;
        } else {
            bucket[1] = new_entry;
        }
    }
}
