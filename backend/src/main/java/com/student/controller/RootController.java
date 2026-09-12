package com.student.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.HashMap;
import java.util.Map;

@RestController
public class RootController {

    @Autowired
    private DataSource dataSource;

    @GetMapping("/")
    public String home() {
        return "Student Record System API is running. Try /api/students";
    }

    // Checks the DB round-trip specifically, with a hard time budget, so we can
    // tell "app is up but DB connection is stuck" apart from "app is down".
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> status = new HashMap<>();
        long start = System.currentTimeMillis();
        try (Connection conn = dataSource.getConnection()) {
            try (Statement stmt = conn.createStatement()) {
                stmt.setQueryTimeout(5);
                stmt.execute("SELECT 1");
            }
            status.put("status", "UP");
            status.put("db", "UP");
            status.put("dbLatencyMs", System.currentTimeMillis() - start);
            return ResponseEntity.ok(status);
        } catch (Exception e) {
            status.put("status", "DOWN");
            status.put("db", "DOWN");
            status.put("error", e.getMessage());
            status.put("dbLatencyMs", System.currentTimeMillis() - start);
            return ResponseEntity.status(503).body(status);
        }
    }
}
