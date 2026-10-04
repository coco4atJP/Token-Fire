//! 世界の保存先・容量・置換手順だけを受け持つ。ゲームの意味や移行はFrontend側に置く。
//! 追記ログを使わず、各キーにつき確定版・直前版・作業中の最大3ファイルへ限定する。

use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub const PROJECT_LIMIT_BYTES: u64 = 4 * 1024 * 1024;
pub const TOTAL_LIMIT_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_PROJECT_COUNT: usize = 1024;
const MAX_KEY_BYTES: usize = 16 * 1024;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    pub storage_bytes: u64,
    pub project_bytes: u64,
    pub backup_bytes: u64,
    pub temporary_bytes: u64,
    pub project_count: usize,
    pub file_count: usize,
    pub max_project_count: usize,
    pub project_limit_bytes: u64,
    pub total_limit_bytes: u64,
}

pub struct WorldStore {
    directory: PathBuf,
    project_limit: u64,
    total_limit: u64,
    max_project_count: usize,
}

#[derive(Debug)]
enum RecordError {
    Invalid(String),
    Future(String),
}

impl RecordError {
    fn message(&self) -> &str {
        match self {
            Self::Invalid(message) | Self::Future(message) => message,
        }
    }
}

struct StoredRecord {
    data: String,
    byte_len: u64,
    validation: Result<String, RecordError>,
}

struct ProjectFiles {
    current: Option<StoredRecord>,
    backup: Option<StoredRecord>,
    temporary: Option<StoredRecord>,
}

impl ProjectFiles {
    fn best(&self) -> Result<Option<&StoredRecord>, String> {
        if let Some(current) = &self.current {
            if current.validation.is_ok() {
                return Ok(Some(current));
            }
        }
        if let Some(backup) = &self.backup {
            if backup.validation.is_ok() {
                return Ok(Some(backup));
            }
        }
        // 作業中ファイルは未確定なので復元対象にしない。確定版が壊れていれば黙って初期化しない。
        for record in [&self.current, &self.backup].into_iter().flatten() {
            if let Err(error) = &record.validation {
                return Err(error.message().to_string());
            }
        }
        Ok(None)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WriteStage {
    BeforeWrite,
    Staged,
    BackedUp,
    Committed,
}

impl WorldStore {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            project_limit: PROJECT_LIMIT_BYTES,
            total_limit: TOTAL_LIMIT_BYTES,
            max_project_count: MAX_PROJECT_COUNT,
        }
    }

    pub fn read_projects(&self) -> Result<Vec<String>, String> {
        let (status, stems) = self.inventory()?;
        if stems.len() > self.max_project_count {
            return Err("world storage exceeds the 1024 project limit; existing files were not changed".into());
        }
        if status.storage_bytes > self.total_limit {
            return Err("world storage exceeds the 64 MiB limit; existing files were not changed".into());
        }
        let mut records = Vec::new();
        for stem in stems {
            let files = self.read_files(&stem)?;
            if let Some(record) = files.best()? {
                records.push(record.data.clone());
            }
        }
        Ok(records)
    }

    pub fn status(&self) -> Result<StorageStatus, String> {
        self.inventory().map(|(status, _)| status)
    }

    pub fn write_project(&self, key: &str, data: &str) -> Result<(), String> {
        self.write_with_checkpoint(key, data, |_| Ok(()))
    }

    fn write_with_checkpoint(
        &self,
        key: &str,
        data: &str,
        checkpoint: impl Fn(WriteStage) -> Result<(), String>,
    ) -> Result<(), String> {
        validate_key(key)?;
        if data.len() as u64 > self.project_limit {
            return Err("world project exceeds the 4 MiB limit".into());
        }
        let record_key = validate_record(data).map_err(|error| error.message().to_string())?;
        if record_key != key {
            return Err("world project key does not match the command key".into());
        }
        self.ensure_directory()?;
        let stem = project_stem(key);
        let files = self.read_files(&stem)?;
        files.best()?;
        for record in [&files.current, &files.backup, &files.temporary].into_iter().flatten() {
            if record.validation.as_ref().is_ok_and(|existing_key| existing_key != key) {
                return Err("world file is occupied by a different project key".into());
            }
        }
        let current_valid = files.current.as_ref().is_some_and(|record| record.validation.is_ok());
        let current = self.path(&stem, "json");
        let backup = self.path(&stem, "bak");
        let temporary = self.path(&stem, "tmp");
        let (status, stems) = self.inventory()?;
        if stems.len() > self.max_project_count || (stems.len() == self.max_project_count && !stems.contains(&stem)) {
            return Err("world storage would exceed 1024 projects; no projects were removed".into());
        }
        // 直前版を捨ててよいのは、確定版が検証できた場合だけ。作業領域込みで上限を判定する。
        let reclaimable_backup = if current_valid {
            files.backup.as_ref().map_or(0, |record| record.byte_len)
        } else {
            0
        };
        let stale_temporary = files.temporary.as_ref().map_or(0, |record| record.byte_len);
        let peak_bytes = status.storage_bytes
            .checked_sub(reclaimable_backup + stale_temporary)
            .and_then(|bytes| bytes.checked_add(data.len() as u64))
            .ok_or_else(|| "world storage byte count overflow".to_string())?;
        if peak_bytes > self.total_limit {
            return Err("world storage would exceed 64 MiB including recovery files; no projects were removed".into());
        }
        let reclaimed_files = usize::from(files.temporary.is_some())
            + usize::from(current_valid && files.backup.is_some());
        if status.file_count - reclaimed_files + 1 > self.max_project_count * 3 {
            return Err("world storage would exceed the bounded file count; no files were changed".into());
        }
        if files.temporary.is_some() {
            remove_file(&temporary)?;
        }
        if current_valid && files.backup.is_some() {
            remove_file(&backup)?;
        }
        sync_directory(&self.directory)?;
        let staging_result = (|| {
            let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary)
                .map_err(|error| format!("could not stage world project: {error}"))?;
            checkpoint(WriteStage::BeforeWrite)?;
            file.write_all(data.as_bytes())
                .and_then(|_| file.sync_all())
                .map_err(|error| format!("could not durably write world project: {error}"))
        })();
        if let Err(error) = staging_result {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }
        checkpoint(WriteStage::Staged)?;
        if current_valid {
            // 旧版を先に退避してから確定する復元可能な二段階commit。中断時は .bak から読める。
            fs::rename(&current, &backup)
                .map_err(|error| format!("could not preserve previous world project: {error}"))?;
        } else if files.current.is_some() {
            // 壊れた確定版を置換する場合も、検証済み .bak は最後まで保持する。
            remove_file(&current)?;
        }
        sync_directory(&self.directory)?;
        checkpoint(WriteStage::BackedUp)?;
        fs::rename(&temporary, &current)
            .map_err(|error| format!("could not commit world project; previous save remains recoverable: {error}"))?;
        sync_directory(&self.directory)?;
        checkpoint(WriteStage::Committed)?;
        Ok(())
    }

    fn path(&self, stem: &str, extension: &str) -> PathBuf {
        self.directory.join(format!("{stem}.{extension}"))
    }

    fn ensure_directory(&self) -> Result<(), String> {
        fs::create_dir_all(&self.directory)
            .map_err(|error| format!("could not create world storage directory: {error}"))?;
        self.check_directory().map(|_| ())
    }

    fn check_directory(&self) -> Result<bool, String> {
        match fs::symlink_metadata(&self.directory) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(true),
            Ok(_) => Err("world storage directory must be a real directory".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(format!("could not inspect world storage directory: {error}")),
        }
    }

    fn inventory(&self) -> Result<(StorageStatus, BTreeSet<String>), String> {
        let mut status = StorageStatus {
            storage_bytes: 0,
            project_bytes: 0,
            backup_bytes: 0,
            temporary_bytes: 0,
            project_count: 0,
            file_count: 0,
            max_project_count: self.max_project_count,
            project_limit_bytes: self.project_limit,
            total_limit_bytes: self.total_limit,
        };
        let mut stems = BTreeSet::new();
        let mut committed_stems = BTreeSet::new();
        if !self.check_directory()? {
            return Ok((status, stems));
        }
        for entry in fs::read_dir(&self.directory).map_err(|error| format!("could not list world storage: {error}"))? {
            let entry = entry.map_err(|error| format!("could not inspect world storage entry: {error}"))?;
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|error| format!("could not inspect world storage file: {error}"))?;
            // 他の場所へ逸脱するリンクや再帰ディレクトリを追わず、上限の抜け道にもしない。
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                return Err("world storage contains an unexpected non-regular file".into());
            }
            status.file_count += 1;
            if status.file_count > self.max_project_count * 3 {
                return Err("world storage exceeds the bounded file count; existing files were not changed".into());
            }
            status.storage_bytes = status.storage_bytes.checked_add(metadata.len())
                .ok_or_else(|| "world storage byte count overflow".to_string())?;
            let name = entry.file_name();
            if let Some((stem, extension)) = name.to_str().and_then(parse_filename) {
                stems.insert(stem.to_string());
                match extension {
                    "json" => { status.project_bytes += metadata.len(); committed_stems.insert(stem.to_string()); }
                    "bak" => { status.backup_bytes += metadata.len(); committed_stems.insert(stem.to_string()); }
                    "tmp" => status.temporary_bytes += metadata.len(),
                    _ => unreachable!(),
                }
            }
        }
        status.project_count = committed_stems.len();
        Ok((status, stems))
    }

    fn read_files(&self, stem: &str) -> Result<ProjectFiles, String> {
        let files = ProjectFiles {
            current: self.read_file(&self.path(stem, "json"))?,
            backup: self.read_file(&self.path(stem, "bak"))?,
            temporary: self.read_file(&self.path(stem, "tmp"))?,
        };
        for record in [&files.current, &files.backup, &files.temporary].into_iter().flatten() {
            match &record.validation {
                Ok(key) if project_stem(key) != stem => return Err("world file name does not match its project key".into()),
                Err(RecordError::Future(message)) => return Err(message.clone()),
                _ => {}
            }
        }
        Ok(files)
    }

    fn read_file(&self, path: &Path) -> Result<Option<StoredRecord>, String> {
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("could not inspect world project: {error}")),
        };
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err("world project must be a regular file".into());
        }
        if metadata.len() > self.project_limit {
            return Err("existing world project exceeds the 4 MiB limit; file was not changed".into());
        }
        let mut bytes = Vec::new();
        File::open(path).map_err(|error| format!("could not open world project: {error}"))?
            .take(self.project_limit + 1).read_to_end(&mut bytes)
            .map_err(|error| format!("could not read world project: {error}"))?;
        let byte_len = bytes.len() as u64;
        if byte_len > self.project_limit {
            return Err("world project grew beyond the 4 MiB limit while reading".into());
        }
        let (data, validation) = match String::from_utf8(bytes) {
            Ok(data) => {
                let validation = validate_record(&data);
                (data, validation)
            }
            Err(_) => (String::new(), Err(RecordError::Invalid("world project is not valid UTF-8".into()))),
        };
        Ok(Some(StoredRecord { data, byte_len, validation }))
    }
}

fn project_stem(key: &str) -> String {
    // 生のパスをファイル名へ使わない。長いパスや区切り文字でも固定長になり、読み戻し時にもキーを照合する。
    format!("{:x}", Sha256::digest(key.as_bytes()))
}

fn parse_filename(name: &str) -> Option<(&str, &str)> {
    let (stem, extension) = name.rsplit_once('.')?;
    (stem.len() == 64 && stem.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        && matches!(extension, "json" | "bak" | "tmp")).then_some((stem, extension))
}

fn remove_file(path: &Path) -> Result<(), String> {
    fs::remove_file(path).map_err(|error| format!("could not replace world recovery file: {error}"))
}

fn sync_directory(path: &Path) -> Result<(), String> {
    // Unixではrenameを含むディレクトリ更新も同期する。Windowsの標準APIでは各ファイルのsync_allまでを保証する。
    #[cfg(unix)]
    File::open(path).and_then(|directory| directory.sync_all())
        .map_err(|error| format!("could not synchronize world storage directory: {error}"))?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.is_empty() || key.len() > MAX_KEY_BYTES || key.contains('\0') {
        return Err("world project key must be non-empty and at most 16 KiB without NUL bytes".into());
    }
    Ok(())
}

fn validate_record(data: &str) -> Result<String, RecordError> {
    let value: Value = serde_json::from_str(data)
        .map_err(|error| RecordError::Invalid(format!("world project is not valid JSON: {error}")))?;
    let root = value.as_object().ok_or_else(|| RecordError::Invalid("world project envelope must be an object".into()))?;
    match root.get("version") {
        Some(version) if version.as_u64() == Some(3) => {},
        Some(_) => return Err(RecordError::Future("unsupported world version; existing files were not changed".into())),
        None => return Err(RecordError::Invalid("world project version is missing".into())),
    }
    validate_project(root.get("project").unwrap_or(&Value::Null))
        .map_err(|error| RecordError::Invalid(format!("world project is malformed: {error}")))
}

fn object(value: &Value) -> Result<&Map<String, Value>, String> {
    value.as_object().ok_or_else(|| "expected an object".into())
}

fn field<'a>(value: &'a Map<String, Value>, name: &str) -> Result<&'a Value, String> {
    value.get(name).ok_or_else(|| format!("missing {name}"))
}

fn text<'a>(value: &'a Map<String, Value>, name: &str) -> Result<&'a str, String> {
    field(value, name)?.as_str().ok_or_else(|| format!("{name} must be a string"))
}

fn number(value: &Map<String, Value>, name: &str) -> Result<(), String> {
    if field(value, name)?.as_f64().is_some_and(f64::is_finite) { Ok(()) } else { Err(format!("{name} must be finite")) }
}

fn nullable_text(value: &Map<String, Value>, name: &str) -> Result<(), String> {
    let field = field(value, name)?;
    if field.is_null() || field.is_string() { Ok(()) } else { Err(format!("{name} must be a string or null")) }
}

fn array<'a>(value: &'a Map<String, Value>, name: &str) -> Result<&'a Vec<Value>, String> {
    field(value, name)?.as_array().ok_or_else(|| format!("{name} must be an array"))
}

fn numbers(value: &Map<String, Value>, names: &[&str]) -> Result<(), String> {
    for name in names { number(value, name)?; }
    Ok(())
}

fn strings(value: &Map<String, Value>, names: &[&str]) -> Result<(), String> {
    for name in names { text(value, name)?; }
    Ok(())
}

fn boolean(value: &Map<String, Value>, name: &str) -> Result<(), String> {
    if field(value, name)?.is_boolean() { Ok(()) } else { Err(format!("{name} must be a boolean")) }
}

fn validate_project(value: &Value) -> Result<String, String> {
    let project = object(value)?;
    let key = text(project, "projectKey")?;
    validate_key(key)?;
    text(project, "projectLabel")?;
    nullable_text(project, "projectPath")?;
    nullable_text(project, "model")?;
    numbers(project, &["savedAt", "water", "heat", "pollution", "rain", "tokenProduced", "destructionScore", "restorationScore", "growthLevel", "energyLevel", "rngState"])?;
    for name in ["tokenQueue", "fuelProgress", "taskTokens"] {
        if project.contains_key(name) { number(project, name)?; }
    }
    for tree in array(project, "trees")? {
        let tree = object(tree)?;
        numbers(tree, &["id", "burn", "regrow"])?;
        if !matches!(text(tree, "stage")?, "sapling" | "grown" | "burning" | "charred") {
            return Err("unknown tree stage".into());
        }
    }
    let debt = object(field(project, "debt")?)?;
    numbers(debt, &["totalTokensBurned", "weightedTokensBurned", "wastedTokens", "treesHarvested", "forestWipeouts", "completedJobs", "greenwashCeremonies", "peakAgents", "largestTaskTokens", "manualDamage"])?;
    nullable_text(debt, "lastModel")?;
    for character in object(field(project, "characters")?)?.values() {
        let character = object(character)?;
        strings(character, &["act", "mood"])?;
        number(character, "interactions")?;
    }
    let environment = object(field(project, "environment")?)?;
    strings(environment, &["timePhase", "weather"])?;
    numbers(environment, &["hour", "weatherUpdatedAt"])?;
    if !field(environment, "temperatureC")?.is_null() { number(environment, "temperatureC")?; }
    for moment in array(project, "history")? {
        let moment = object(moment)?;
        strings(moment, &["id", "projectKey", "type", "title", "line"])?;
        numbers(moment, &["at", "importance"])?;
        for name in ["eventType", "tone"] { if moment.contains_key(name) { text(moment, name)?; } }
        if moment.contains_key("tokens") { number(moment, "tokens")?; }
        if moment.contains_key("model") { nullable_text(moment, "model")?; }
    }
    for discovery in object(field(project, "discoveries")?)?.values() {
        let discovery = object(discovery)?;
        strings(discovery, &["eventType", "title", "line"])?;
        numbers(discovery, &["firstSeenAt", "lastSeenAt", "count"])?;
    }
    for replay in array(project, "replays")? {
        let replay = object(replay)?;
        strings(replay, &["id", "projectKey", "projectLabel", "title"])?;
        numbers(replay, &["startedAt", "endedAt", "totalTokens"])?;
        nullable_text(replay, "sessionId")?;
        nullable_text(replay, "model")?;
        boolean(replay, "wasted")?;
        for frame in array(replay, "frames")? {
            let frame = object(frame)?;
            numbers(frame, &["t", "agents", "taskTokens", "totalTokens", "energyLevel", "growthLevel", "heat", "pollution", "water", "rain", "chill"])?;
            strings(frame, &["status", "effort", "trees"])?;
            boolean(frame, "active")?;
            nullable_text(frame, "event")?;
        }
    }
    Ok(key.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_ID: AtomicUsize = AtomicUsize::new(0);
    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!("token-fire-world-test-{}-{}", std::process::id(), NEXT_ID.fetch_add(1, Ordering::Relaxed))))
        }
    }
    impl Drop for TestDirectory { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

    fn record(key: &str, tokens: u64) -> String {
        json!({"version":3,"project":{
            "projectKey":key,"projectLabel":"test","projectPath":null,"model":null,
            "savedAt":1,"trees":[],"water":1,"heat":0,"pollution":0,"rain":0,
            "tokenProduced":tokens,"destructionScore":0,"restorationScore":0,
            "growthLevel":0,"energyLevel":0,"rngState":1,
            "debt":{"totalTokensBurned":tokens,"weightedTokensBurned":0,"wastedTokens":0,
                "treesHarvested":0,"forestWipeouts":0,"completedJobs":0,"greenwashCeremonies":0,
                "peakAgents":0,"largestTaskTokens":0,"manualDamage":0,"lastModel":null},
            "characters":{},"environment":{"timePhase":"day","hour":12,"weather":"unknown","temperatureC":null,"weatherUpdatedAt":0},
            "history":[],"discoveries":{},"replays":[]
        }}).to_string()
    }

    #[test]
    fn deterministic_filenames_do_not_use_raw_paths() {
        assert_eq!(project_stem("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert!(parse_filename(&format!("{}.json", project_stem("../../世界/test"))).is_some());
        assert!(parse_filename("../project.json").is_none());
        assert_ne!(project_stem("a/b"), project_stem("a\\b"));
    }

    #[test]
    fn missing_or_malformed_records_are_rejected() {
        for data in ["null", "[]", "{}", r#"{"version":3}"#, r#"{"version":3,"project":{}}"#, "{broken"] {
            assert!(validate_record(data).is_err());
        }
        let mut data: Value = serde_json::from_str(&record("one", 1)).unwrap();
        data["project"]["replays"] = json!([{"frames":null}]);
        assert!(validate_record(&data.to_string()).is_err());
        data = serde_json::from_str(&record("one", 1)).unwrap();
        data["project"].as_object_mut().unwrap().remove("debt");
        assert!(validate_record(&data.to_string()).is_err());
    }

    #[test]
    fn a_day_of_five_second_saves_has_constant_file_count_and_bounded_physical_payload() {
        let directory = TestDirectory::new();
        let store = WorldStore::new(directory.0.clone());
        assert!(store.read_projects().unwrap().is_empty());
        // 24時間 × 60分 × 60秒 / 5秒。実時間は待たず、同じ置換・fsyncを実行する。
        let saves_per_day = 24 * 60 * 60 / 5;
        for tokens in 0..saves_per_day {
            store.write_project("one", &record("one", tokens)).unwrap();
            assert!(store.status().unwrap().storage_bytes <= TOTAL_LIMIT_BYTES);
        }
        assert_eq!(store.read_projects().unwrap(), vec![record("one", saves_per_day - 1)]);
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 2);
        let status = store.status().unwrap();
        assert_eq!(status.project_count, 1);
        assert_eq!(status.storage_bytes, (record("one", saves_per_day - 1).len() + record("one", saves_per_day - 2).len()) as u64);
        assert_eq!(status.temporary_bytes, 0);
    }

    #[test]
    fn project_count_is_bounded_without_deleting_older_projects() {
        let directory = TestDirectory::new();
        let mut store = WorldStore::new(directory.0.clone());
        store.max_project_count = 2;
        store.write_project("one", &record("one", 1)).unwrap();
        store.write_project("two", &record("two", 2)).unwrap();
        assert!(store.write_project("three", &record("three", 3)).is_err());
        store.write_project("one", &record("one", 4)).unwrap();
        assert_eq!(store.status().unwrap().project_count, 2);
        assert_eq!(store.status().unwrap().max_project_count, 2);
        assert!(store.read_projects().unwrap().contains(&record("two", 2)));
    }

    #[test]
    fn a_failed_commit_rename_preserves_the_previous_acknowledged_record() {
        let directory = TestDirectory::new();
        let store = WorldStore::new(directory.0.clone());
        store.write_project("one", &record("one", 1)).unwrap();
        let temporary = store.path(&project_stem("one"), "tmp");
        let result = store.write_with_checkpoint("one", &record("one", 2), |stage| {
            // rename元を消して実際のOS renameエラーを発生させる。
            if stage == WriteStage::BackedUp { fs::remove_file(&temporary).unwrap(); }
            Ok(())
        });
        assert!(result.unwrap_err().contains("could not commit"));
        assert_eq!(store.read_projects().unwrap(), vec![record("one", 1)]);
        store.write_project("one", &record("one", 3)).unwrap();
        assert_eq!(store.read_projects().unwrap(), vec![record("one", 3)]);
    }

    #[test]
    fn a_partial_staging_write_failure_removes_temp_and_preserves_previous_save() {
        let directory = TestDirectory::new();
        let store = WorldStore::new(directory.0.clone());
        store.write_project("one", &record("one", 1)).unwrap();
        let temporary = store.path(&project_stem("one"), "tmp");
        let result = store.write_with_checkpoint("one", &record("one", 2), |stage| {
            if stage == WriteStage::BeforeWrite {
                fs::write(&temporary, "{truncated").unwrap();
                return Err("simulated disk-full after a partial write".into());
            }
            Ok(())
        });
        assert!(result.is_err());
        assert!(!temporary.exists());
        assert_eq!(store.read_projects().unwrap(), vec![record("one", 1)]);
    }

    #[test]
    fn writes_only_change_the_requested_project() {
        let directory = TestDirectory::new();
        let store = WorldStore::new(directory.0.clone());
        store.write_project("one", &record("one", 1)).unwrap();
        store.write_project("two", &record("two", 2)).unwrap();
        store.write_project("one", &record("one", 3)).unwrap();
        let records = store.read_projects().unwrap();
        assert!(records.contains(&record("one", 3)));
        assert!(records.contains(&record("two", 2)));
        assert!(store.write_project("two", &record("one", 4)).is_err());
    }

    #[test]
    fn interrupted_writes_always_recover_an_acknowledged_save() {
        for phase in [WriteStage::Staged, WriteStage::BackedUp] {
            let directory = TestDirectory::new();
            let store = WorldStore::new(directory.0.clone());
            store.write_project("one", &record("one", 1)).unwrap();
            let result = store.write_with_checkpoint("one", &record("one", 2), |stage| {
                if stage == phase { Err("simulated failure".into()) } else { Ok(()) }
            });
            assert!(result.is_err());
            assert_eq!(store.read_projects().unwrap(), vec![record("one", 1)]);
            store.write_project("one", &record("one", 3)).unwrap();
            assert_eq!(store.read_projects().unwrap(), vec![record("one", 3)]);
            assert_eq!(store.status().unwrap().temporary_bytes, 0);
        }
    }

    #[test]
    fn corrupt_current_recovers_previous_without_destroying_it_on_failed_write() {
        let directory = TestDirectory::new();
        let store = WorldStore::new(directory.0.clone());
        store.write_project("one", &record("one", 1)).unwrap();
        store.write_project("one", &record("one", 2)).unwrap();
        fs::write(store.path(&project_stem("one"), "json"), "{broken").unwrap();
        assert_eq!(store.read_projects().unwrap(), vec![record("one", 1)]);
        assert!(store.write_with_checkpoint("one", &record("one", 3), |stage| {
            if stage == WriteStage::BackedUp { Err("simulated failure".into()) } else { Ok(()) }
        }).is_err());
        assert_eq!(store.read_projects().unwrap(), vec![record("one", 1)]);
        store.write_project("one", &record("one", 4)).unwrap();
        assert_eq!(store.read_projects().unwrap(), vec![record("one", 4)]);
    }

    #[test]
    fn invalid_utf8_current_recovers_the_previous_valid_record() {
        let directory = TestDirectory::new();
        let store = WorldStore::new(directory.0.clone());
        store.write_project("one", &record("one", 1)).unwrap();
        store.write_project("one", &record("one", 2)).unwrap();
        fs::write(store.path(&project_stem("one"), "json"), [0xff, 0xfe]).unwrap();
        assert_eq!(store.read_projects().unwrap(), vec![record("one", 1)]);
        store.write_project("one", &record("one", 3)).unwrap();
        assert_eq!(store.read_projects().unwrap(), vec![record("one", 3)]);
    }

    #[test]
    fn future_versions_in_any_slot_are_never_removed_or_overwritten() {
        for extension in ["json", "bak", "tmp"] {
            let directory = TestDirectory::new();
            let store = WorldStore::new(directory.0.clone());
            store.write_project("one", &record("one", 1)).unwrap();
            store.write_project("one", &record("one", 2)).unwrap();
            let path = store.path(&project_stem("one"), extension);
            let future = r#"{"version":999,"project":{"projectKey":"one"}}"#;
            fs::write(&path, future).unwrap();
            let snapshot = || -> std::collections::BTreeMap<_, _> {
                fs::read_dir(&directory.0).unwrap().map(|entry| {
                    let path = entry.unwrap().path();
                    let data = fs::read(&path).unwrap();
                    (path, data)
                }).collect()
            };
            let before = snapshot();
            assert!(store.read_projects().is_err());
            assert!(store.write_project("one", &record("one", 3)).is_err());
            assert_eq!(snapshot(), before);
            assert_eq!(fs::read_to_string(path).unwrap(), future);
        }
    }

    #[test]
    fn byte_limits_include_staging_and_backup_and_preserve_previous_saves() {
        let directory = TestDirectory::new();
        let size = record("one", 1).len() as u64;
        let mut store = WorldStore::new(directory.0.clone());
        store.project_limit = size;
        store.total_limit = size * 2;
        store.write_project("one", &record("one", 1)).unwrap();
        for tokens in 2..10 { store.write_project("one", &record("one", tokens)).unwrap(); }
        assert_eq!(store.status().unwrap().storage_bytes, size * 2);
        assert!(store.write_project("two", &record("two", 1)).is_err());
        assert!(store.write_project("one", &record("one", 10)).is_err());
        assert_eq!(store.read_projects().unwrap(), vec![record("one", 9)]);
    }

    #[test]
    fn mismatched_filenames_and_corrupt_only_copies_are_not_treated_as_new_worlds() {
        let directory = TestDirectory::new();
        let store = WorldStore::new(directory.0.clone());
        store.ensure_directory().unwrap();
        let path = store.path(&project_stem("one"), "json");
        fs::write(&path, record("two", 1)).unwrap();
        assert!(store.read_projects().is_err());
        assert!(store.write_project("one", &record("one", 1)).is_err());
        fs::write(&path, "{broken").unwrap();
        assert!(store.read_projects().is_err());
        assert!(store.write_project("one", &record("one", 1)).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "{broken");
    }
}
