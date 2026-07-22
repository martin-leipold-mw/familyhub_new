package com.familyhub.settings

import org.springframework.data.jpa.repository.JpaRepository

interface SettingRepository : JpaRepository<Setting, String>
