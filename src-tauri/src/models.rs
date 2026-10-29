use serde::{Deserialize, Serialize};

fn default_theme() -> String {
    "system".to_string()
}

fn default_schema_version() -> u32 {
    2
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Person {
    pub id: String,
    pub name: String,
    pub title: Option<String>,
    pub quote: Option<String>,
    pub image_path: Option<String>,
    pub respect_count: u32,
    pub created_at: String,
    #[serde(default)]
    pub has_detail: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LedgerType {
    Earn,
    Spend,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub id: String,
    pub r#type: LedgerType,
    pub amount: u32,
    pub person_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub focus_duration_minutes: u32,
    pub short_break_duration_minutes: u32,
    pub long_break_duration_minutes: u32,
    pub sessions_before_long_break: u32,
    pub points_per_focus_minute: u32,
    pub respect_cost: u32,
    #[serde(default = "default_theme")]
    pub theme: String, // "system" | "light" | "dark"
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            focus_duration_minutes: 25,
            short_break_duration_minutes: 5,
            long_break_duration_minutes: 15,
            sessions_before_long_break: 4,
            points_per_focus_minute: 1,
            respect_cost: 5,
            theme: "system".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseData {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub persons: Vec<Person>,
    pub ledger: Vec<LedgerEntry>,
    pub settings: Settings,
}

impl Default for DatabaseData {
    fn default() -> Self {
        Self {
            schema_version: 2,
            persons: Vec::new(),
            ledger: Vec::new(),
            settings: Settings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePersonInput {
    pub name: String,
    pub title: Option<String>,
    pub quote: Option<String>,
    pub detail: Option<String>,
    pub image_base64: Option<String>,
    pub image_extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePersonInput {
    pub id: String,
    pub name: String,
    pub title: Option<String>,
    pub quote: Option<String>,
    pub detail: Option<String>,
    pub image_base64: Option<String>,
    pub image_extension: Option<String>,
    pub remove_image: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStateSummary {
    pub persons: Vec<Person>,
    pub balance: i64,
    pub settings: Settings,
    pub total_earned: u64,
    pub total_spent: u64,
    pub data_directory: String,
}
