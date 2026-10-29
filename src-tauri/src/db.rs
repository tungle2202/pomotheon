use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use chrono::Utc;
use uuid::Uuid;

use crate::models::{
    AppStateSummary, CreatePersonInput, DatabaseData, LedgerEntry, LedgerType, Person, Settings,
    UpdatePersonInput,
};

const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024; // 5 MB limit
const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "svg"];

pub struct Database {
    data_dir: PathBuf,
    db_file: PathBuf,
    images_dir: PathBuf,
    details_dir: PathBuf,
    pub data: DatabaseData,
}

impl Database {
    pub fn init(data_dir: PathBuf) -> Result<Self, String> {
        let images_dir = data_dir.join("images");
        fs::create_dir_all(&images_dir)
            .map_err(|e| format!("Failed to create data/images directory: {}", e))?;

        let details_dir = data_dir.join("details");
        fs::create_dir_all(&details_dir)
            .map_err(|e| format!("Failed to create data/details directory: {}", e))?;

        let db_file = data_dir.join("db.json");
        let data = if db_file.exists() {
            let content = fs::read_to_string(&db_file)
                .map_err(|e| format!("Failed to read database file: {}", e))?;
            
            // Perform schema migration if needed
            let mut val: serde_json::Value = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse JSON: {}", e))?;

            let mut needs_migration_save = false;
            let current_version = val.get("schema_version").and_then(|v| v.as_u64()).unwrap_or(1);

            if current_version < 2 {
                needs_migration_save = true;
                val["schema_version"] = serde_json::json!(2);
            }

            // Check persons for legacy inline detail
            if let Some(persons_arr) = val.get_mut("persons").and_then(|v| v.as_array_mut()) {
                for person_obj in persons_arr.iter_mut() {
                    let id_opt = person_obj.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let detail_opt = person_obj.get("detail").and_then(|v| v.as_str()).map(|s| s.to_string());

                    if let Some(id) = id_opt {
                        let detail_file = details_dir.join(format!("{}.md", id));
                        let has_detail = if let Some(detail_text) = detail_opt {
                            needs_migration_save = true;
                            let trimmed = detail_text.trim();
                            if !trimmed.is_empty() {
                                let _ = fs::write(&detail_file, trimmed);
                                true
                            } else {
                                detail_file.exists()
                            }
                        } else {
                            detail_file.exists()
                        };

                        if let Some(map) = person_obj.as_object_mut() {
                            if map.contains_key("detail") {
                                map.remove("detail");
                                needs_migration_save = true;
                            }
                            map.insert("has_detail".to_string(), serde_json::json!(has_detail));
                        }
                    }
                }
            }

            let loaded_data: DatabaseData = serde_json::from_value(val.clone())
                .map_err(|e| format!("Failed to parse migrated database file: {}", e))?;

            if needs_migration_save {
                let serialized = serde_json::to_string_pretty(&loaded_data)
                    .map_err(|e| format!("Failed to serialize migrated database: {}", e))?;
                let temp_file = data_dir.join("db.json.tmp");
                fs::write(&temp_file, serialized.as_bytes())
                    .map_err(|e| format!("Failed to write migrated database: {}", e))?;
                fs::rename(&temp_file, &db_file)
                    .map_err(|e| format!("Failed to replace database file: {}", e))?;
            }

            loaded_data
        } else {
            let default_data = DatabaseData::default();
            let content = serde_json::to_string_pretty(&default_data)
                .map_err(|e| format!("Failed to serialize default database: {}", e))?;
            fs::write(&db_file, content)
                .map_err(|e| format!("Failed to write initial database: {}", e))?;
            default_data
        };

        Ok(Self {
            data_dir,
            db_file,
            images_dir,
            details_dir,
            data,
        })
    }

    pub fn save(&self) -> Result<(), String> {
        let content = serde_json::to_string_pretty(&self.data)
            .map_err(|e| format!("Failed to serialize database: {}", e))?;

        let temp_file = self.data_dir.join("db.json.tmp");
        {
            let mut file = File::create(&temp_file)
                .map_err(|e| format!("Failed to create temporary db file: {}", e))?;
            file.write_all(content.as_bytes())
                .map_err(|e| format!("Failed to write to temporary db file: {}", e))?;
            file.sync_all()
                .map_err(|e| format!("Failed to sync temporary db file: {}", e))?;
        }

        fs::rename(&temp_file, &self.db_file)
            .map_err(|e| format!("Failed to atomically rename database file: {}", e))?;

        Ok(())
    }

    pub fn calculate_balance(&self) -> i64 {
        let earned: i64 = self
            .data
            .ledger
            .iter()
            .filter(|e| e.r#type == LedgerType::Earn)
            .map(|e| e.amount as i64)
            .sum();
        let spent: i64 = self
            .data
            .ledger
            .iter()
            .filter(|e| e.r#type == LedgerType::Spend)
            .map(|e| e.amount as i64)
            .sum();
        earned - spent
    }

    pub fn total_earned(&self) -> u64 {
        self.data
            .ledger
            .iter()
            .filter(|e| e.r#type == LedgerType::Earn)
            .map(|e| e.amount as u64)
            .sum()
    }

    pub fn total_spent(&self) -> u64 {
        self.data
            .ledger
            .iter()
            .filter(|e| e.r#type == LedgerType::Spend)
            .map(|e| e.amount as u64)
            .sum()
    }

    pub fn get_app_summary(&self) -> AppStateSummary {
        AppStateSummary {
            persons: self.data.persons.clone(),
            balance: self.calculate_balance(),
            settings: self.data.settings.clone(),
            total_earned: self.total_earned(),
            total_spent: self.total_spent(),
            data_directory: self.data_dir.to_string_lossy().to_string(),
        }
    }

    fn sanitize_optional_string(opt: Option<String>) -> Option<String> {
        opt.and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
    }

    fn save_image_payload(
        &self,
        base64_str: &str,
        ext_hint: Option<&str>,
    ) -> Result<String, String> {
        let raw_base64 = if let Some(idx) = base64_str.find(";base64,") {
            &base64_str[idx + 8..]
        } else {
            base64_str
        };

        let decoded = BASE64_STANDARD
            .decode(raw_base64)
            .map_err(|e| format!("Invalid base64 image data: {}", e))?;

        if decoded.len() > MAX_IMAGE_BYTES {
            return Err(format!(
                "Image size exceeds 5MB limit (provided: {} KB)",
                decoded.len() / 1024
            ));
        }

        let ext = ext_hint
            .unwrap_or("png")
            .trim_start_matches('.')
            .to_lowercase();
        if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
            return Err(format!(
                "Unsupported image extension '.{}'. Allowed: {:?}",
                ext, ALLOWED_EXTENSIONS
            ));
        }

        let file_name = format!("{}.{}", Uuid::new_v4(), ext);
        let destination = self.images_dir.join(&file_name);
        fs::write(&destination, decoded)
            .map_err(|e| format!("Failed to save image to disk: {}", e))?;

        Ok(format!("images/{}", file_name))
    }

    fn remove_image_file(&self, relative_path: &str) {
        let clean_path = relative_path.trim_start_matches('/').trim_start_matches('\\');
        let full_path = self.data_dir.join(clean_path);
        if full_path.starts_with(&self.images_dir) && full_path.exists() {
            let _ = fs::remove_file(full_path);
        }
    }

    pub fn save_detail_file(&self, id: &str, detail_text: Option<&str>) -> Result<bool, String> {
        let detail_file = self.details_dir.join(format!("{}.md", id));
        if let Some(text) = detail_text {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                let temp_file = self.details_dir.join(format!("{}.md.tmp", id));
                fs::write(&temp_file, trimmed)
                    .map_err(|e| format!("Failed to write detail markdown file: {}", e))?;
                fs::rename(&temp_file, &detail_file)
                    .map_err(|e| format!("Failed to rename detail markdown file: {}", e))?;
                return Ok(true);
            }
        }

        if detail_file.exists() {
            let _ = fs::remove_file(detail_file);
        }
        Ok(false)
    }

    pub fn get_person_detail(&self, id: &str) -> Result<String, String> {
        let detail_file = self.details_dir.join(format!("{}.md", id));
        if detail_file.exists() {
            fs::read_to_string(&detail_file)
                .map_err(|e| format!("Failed to read detail file: {}", e))
        } else {
            Ok(String::new())
        }
    }

    pub fn create_person(&mut self, input: CreatePersonInput) -> Result<Person, String> {
        let name = input.name.trim().to_string();
        if name.is_empty() {
            return Err("Person name is required and cannot be blank.".to_string());
        }

        let id = Uuid::new_v4().to_string();

        let image_path = if let Some(b64) = input.image_base64 {
            if !b64.trim().is_empty() {
                Some(self.save_image_payload(&b64, input.image_extension.as_deref())?)
            } else {
                None
            }
        } else {
            None
        };

        let has_detail = self.save_detail_file(&id, input.detail.as_deref())?;

        let person = Person {
            id,
            name,
            title: Self::sanitize_optional_string(input.title),
            quote: Self::sanitize_optional_string(input.quote),
            image_path,
            respect_count: 0,
            created_at: Utc::now().to_rfc3339(),
            has_detail,
        };

        self.data.persons.push(person.clone());
        self.save()?;
        Ok(person)
    }

    pub fn update_person(&mut self, input: UpdatePersonInput) -> Result<Person, String> {
        let name = input.name.trim().to_string();
        if name.is_empty() {
            return Err("Person name is required and cannot be blank.".to_string());
        }

        let person_idx = self
            .data
            .persons
            .iter()
            .position(|p| p.id == input.id)
            .ok_or_else(|| format!("Person with ID '{}' not found.", input.id))?;

        let old_image = self.data.persons[person_idx].image_path.clone();
        let mut new_image_path = old_image.clone();

        if input.remove_image {
            if let Some(ref old) = old_image {
                self.remove_image_file(old);
            }
            new_image_path = None;
        } else if let Some(b64) = input.image_base64 {
            if !b64.trim().is_empty() {
                let saved = self.save_image_payload(&b64, input.image_extension.as_deref())?;
                if let Some(ref old) = old_image {
                    self.remove_image_file(old);
                }
                new_image_path = Some(saved);
            }
        }

        let has_detail = self.save_detail_file(&input.id, input.detail.as_deref())?;

        let person = &mut self.data.persons[person_idx];
        person.name = name;
        person.title = Self::sanitize_optional_string(input.title);
        person.quote = Self::sanitize_optional_string(input.quote);
        person.image_path = new_image_path;
        person.has_detail = has_detail;

        let updated = person.clone();
        self.save()?;
        Ok(updated)
    }

    pub fn delete_person(&mut self, id: &str) -> Result<(), String> {
        let person_idx = self
            .data
            .persons
            .iter()
            .position(|p| p.id == id)
            .ok_or_else(|| format!("Person with ID '{}' not found.", id))?;

        let person = self.data.persons.remove(person_idx);
        if let Some(ref img) = person.image_path {
            self.remove_image_file(img);
        }

        // Delete associated Markdown detail file
        let detail_file = self.details_dir.join(format!("{}.md", id));
        if detail_file.exists() {
            let _ = fs::remove_file(detail_file);
        }

        self.save()?;
        Ok(())
    }

    pub fn pay_respect(&mut self, person_id: &str) -> Result<(u32, i64), String> {
        let balance = self.calculate_balance();
        let cost = self.data.settings.respect_cost as i64;
        if balance < cost {
            return Err(format!(
                "Insufficient points: you have {} points, but {} points are needed to pay respect.",
                balance, cost
            ));
        }

        let person = self
            .data
            .persons
            .iter_mut()
            .find(|p| p.id == person_id)
            .ok_or_else(|| format!("Person with ID '{}' not found.", person_id))?;

        person.respect_count += 1;
        let new_respect_count = person.respect_count;

        let entry = LedgerEntry {
            id: Uuid::new_v4().to_string(),
            r#type: LedgerType::Spend,
            amount: self.data.settings.respect_cost,
            person_id: Some(person_id.to_string()),
            created_at: Utc::now().to_rfc3339(),
        };
        self.data.ledger.push(entry);

        self.save()?;
        let new_balance = self.calculate_balance();
        Ok((new_respect_count, new_balance))
    }

    pub fn earn_focus_points(&mut self, completed_minutes: u32) -> Result<(u32, i64), String> {
        let points = completed_minutes * self.data.settings.points_per_focus_minute;
        if points > 0 {
            let entry = LedgerEntry {
                id: Uuid::new_v4().to_string(),
                r#type: LedgerType::Earn,
                amount: points,
                person_id: None,
                created_at: Utc::now().to_rfc3339(),
            };
            self.data.ledger.push(entry);
            self.save()?;
        }
        let new_balance = self.calculate_balance();
        Ok((points, new_balance))
    }

    pub fn update_settings(&mut self, settings: Settings) -> Result<Settings, String> {
        if settings.focus_duration_minutes == 0 {
            return Err("Focus duration must be at least 1 minute.".to_string());
        }
        if settings.short_break_duration_minutes == 0 {
            return Err("Short break duration must be at least 1 minute.".to_string());
        }
        if settings.long_break_duration_minutes == 0 {
            return Err("Long break duration must be at least 1 minute.".to_string());
        }
        if settings.sessions_before_long_break == 0 {
            return Err("Sessions before long break must be at least 1.".to_string());
        }
        if settings.respect_cost == 0 {
            return Err("Respect cost must be at least 1 point.".to_string());
        }

        self.data.settings = settings.clone();
        self.save()?;
        Ok(settings)
    }

    pub fn get_image_base64(&self, relative_path: &str) -> Result<String, String> {
        let clean_path = relative_path.trim_start_matches('/').trim_start_matches('\\');
        let full_path = self.data_dir.join(clean_path);

        // Security check: ensure path is within data_dir
        if !full_path.starts_with(&self.data_dir) || !full_path.exists() {
            return Err("Image not found or invalid path.".to_string());
        }

        let bytes = fs::read(&full_path)
            .map_err(|e| format!("Failed to read image file: {}", e))?;

        let ext = Path::new(&clean_path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png")
            .to_lowercase();

        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "webp" => "image/webp",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            _ => "application/octet-stream",
        };

        let encoded = BASE64_STANDARD.encode(&bytes);
        Ok(format!("data:{};base64,{}", mime, encoded))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn setup_test_db() -> (Database, PathBuf) {
        let temp_dir = env::temp_dir().join(format!("pomotheon_test_{}", Uuid::new_v4()));
        let db = Database::init(temp_dir.clone()).expect("Failed to init test DB");
        (db, temp_dir)
    }

    fn cleanup_test_db(path: PathBuf) {
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn test_initial_state_and_defaults() {
        let (db, path) = setup_test_db();
        assert_eq!(db.data.schema_version, 2);
        assert_eq!(db.data.persons.len(), 0);
        assert_eq!(db.calculate_balance(), 0);
        assert_eq!(db.data.settings.focus_duration_minutes, 25);
        assert_eq!(db.data.settings.theme, "system");
        cleanup_test_db(path);
    }

    #[test]
    fn test_person_crud_and_markdown_detail_file() {
        let (mut db, path) = setup_test_db();

        // 1. Create person with detail
        let person = db
            .create_person(CreatePersonInput {
                name: "Marcus Aurelius".to_string(),
                title: Some("Roman Emperor".to_string()),
                quote: Some("Be a good person.".to_string()),
                detail: Some("## Meditations\nStoic philosopher who ruled Rome.".to_string()),
                image_base64: None,
                image_extension: None,
            })
            .expect("Failed to create person");

        assert_eq!(person.name, "Marcus Aurelius");
        assert!(person.has_detail);

        // Verify markdown detail file was written to details/<id>.md
        let detail_content = db.get_person_detail(&person.id).expect("Failed to read detail");
        assert!(detail_content.contains("Stoic philosopher"));

        // 2. Update person detail
        let updated = db
            .update_person(UpdatePersonInput {
                id: person.id.clone(),
                name: "Marcus Aurelius".to_string(),
                title: Some("Emperor".to_string()),
                quote: None,
                detail: None, // Clear detail
                image_base64: None,
                image_extension: None,
                remove_image: false,
            })
            .expect("Failed to update person");

        assert!(!updated.has_detail);
        let cleared_detail = db.get_person_detail(&person.id).expect("Failed to read detail");
        assert!(cleared_detail.is_empty());

        // 3. Delete person deletes markdown detail file
        db.delete_person(&person.id).expect("Failed to delete person");
        let detail_path = db.details_dir.join(format!("{}.md", person.id));
        assert!(!detail_path.exists());

        cleanup_test_db(path);
    }

    #[test]
    fn test_v1_to_v2_migration() {
        let temp_dir = env::temp_dir().join(format!("pomotheon_migr_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        // Write legacy v1 JSON with inline detail
        let v1_json = r#"{
            "persons": [
                {
                    "id": "person-123",
                    "name": "Hypatia",
                    "title": "Philosopher",
                    "quote": "Reserve your right to think.",
                    "detail": "Astronomer in Alexandria.",
                    "image_path": null,
                    "respect_count": 3,
                    "created_at": "2026-01-01T00:00:00Z"
                }
            ],
            "ledger": [],
            "settings": {
                "focus_duration_minutes": 25,
                "short_break_duration_minutes": 5,
                "long_break_duration_minutes": 15,
                "sessions_before_long_break": 4,
                "points_per_focus_minute": 1,
                "respect_cost": 5
            }
        }"#;
        fs::write(temp_dir.join("db.json"), v1_json).unwrap();

        // Initialize Database which triggers migration
        let db = Database::init(temp_dir.clone()).expect("Migration failed");

        assert_eq!(db.data.schema_version, 2);
        assert_eq!(db.data.persons.len(), 1);
        let p = &db.data.persons[0];
        assert_eq!(p.name, "Hypatia");
        assert!(p.has_detail);

        // Verify detail file was created
        let detail_content = db.get_person_detail("person-123").unwrap();
        assert_eq!(detail_content, "Astronomer in Alexandria.");

        // Verify db.json no longer contains inline detail
        let new_json = fs::read_to_string(temp_dir.join("db.json")).unwrap();
        assert!(!new_json.contains("\"detail\":"));

        cleanup_test_db(temp_dir);
    }

    #[test]
    fn test_earn_points_and_pay_respect_lifecycle() {
        let (mut db, path) = setup_test_db();

        let person = db
            .create_person(CreatePersonInput {
                name: "Ada Lovelace".to_string(),
                title: Some("First Programmer".to_string()),
                quote: None,
                detail: None,
                image_base64: None,
                image_extension: None,
            })
            .expect("Failed to create person");

        let pay_fail = db.pay_respect(&person.id);
        assert!(pay_fail.is_err());

        let (earned, bal1) = db.earn_focus_points(25).expect("Failed to earn points");
        assert_eq!(earned, 25);
        assert_eq!(bal1, 25);

        let (respects, bal2) = db.pay_respect(&person.id).expect("Failed to pay respect");
        assert_eq!(respects, 1);
        assert_eq!(bal2, 20);

        cleanup_test_db(path);
    }
}
