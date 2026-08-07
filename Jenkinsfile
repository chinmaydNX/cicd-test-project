pipeline {
  agent any

  environment {
    NXRADAR_API_KEY    = credentials('nxradar-api-key')
    NXRADAR_ORG_ID     = '72OO5R9SCO'
    // Jenkins (Docker) → WSL host services
    NXRADAR_UPLOAD_URL = 'http://172.30.7.59:7007'
    // Static host for nxsbom CLI binary (Phase 14 would use /api/v1/agents/download/cli-linux-x64 once enabled)
    NXRADAR_CLI_URL    = 'http://172.30.7.59:7099/nxsbom'
    NXRADAR_CLIENT_ID  = '693bde842d84d0e636c80b89'
    APP_NAME           = 'cicd-test-project'
    GROUP_NAME         = 'jenkins-cicd-test'
    SUPPLIER           = 'Internal'
    ENVIRONMENT        = 'Dev'
    CRITICALITY        = 'Medium'
    // Set true to fail the build on policy FAIL / compliant=false
    ENABLE_POLICY_GATE = 'true'
  }

  stages {
    stage('Checkout') {
      steps {
        // Drop leftover scanner binaries from prior builds (e.g. ./syft) so they
        // are not cataloged as Go components of this JS app.
        deleteDir()
        checkout scm
      }
    }

    stage('Fetch nxsbom CLI') {
      steps {
        sh '''
          set -e
          # Keep tools OUTSIDE the scanned project tree (not ./bin or ./syft).
          TOOLS_DIR="${WORKSPACE_TMP:-/tmp}/nxradar-cli-${BUILD_TAG}"
          mkdir -p "$TOOLS_DIR"
          curl -fSL -o "$TOOLS_DIR/nxsbom" "$NXRADAR_CLI_URL"
          chmod +x "$TOOLS_DIR/nxsbom"
          "$TOOLS_DIR/nxsbom" --version || "$TOOLS_DIR/nxsbom" --help | head -5
          echo "$TOOLS_DIR" > .nxradar-tools-dir
        '''
      }
    }

    stage('Generate SBOM (nxsbom CLI)') {
      steps {
        sh '''
          set -e
          TOOLS_DIR=$(cat .nxradar-tools-dir)
          export PATH="$TOOLS_DIR:$PATH"

          # Belt-and-suspenders: never leave syft/nxsbom binaries in the scan root
          rm -f ./syft ./nxsbom
          rm -rf ./bin

          # Config shape required by nxsbom CLI 1.0.1 (same fields as agent bundle config.json).
          # encPublicKey is a dummy 32-byte key — we upload plaintext JSON (not .enc) via SA API key.
          ENC_KEY=$(dd if=/dev/urandom bs=32 count=1 2>/dev/null | base64 -w0)
          cat > config.json <<EOF
{
  "orgId": "$NXRADAR_ORG_ID",
  "agentId": "agt_jenkins_${JOB_NAME}",
  "keyId": "agt_jenkins_${JOB_NAME}-k1",
  "serverBaseUrl": "$NXRADAR_UPLOAD_URL",
  "encPublicKey": "$ENC_KEY",
  "defaultTool": "syft"
}
EOF

          nxsbom generate-new \
            -t dir -p . \
            -n "$APP_NAME" \
            -v "${BUILD_NUMBER}" \
            -s "$SUPPLIER" \
            -r "$CRITICALITY" \
            -e "$ENVIRONMENT" \
            -c ./config.json \
            -o sbom.json

          echo "SBOM ready: $(wc -c < sbom.json) bytes"
          grep -oE '"specVersion"[[:space:]]*:[[:space:]]*"[^"]+"' sbom.json | head -1 || true
        '''
      }
    }

    stage('Upload SBOM') {
      steps {
        sh '''
          set -e
          HTTP_CODE=$(curl -sS -o /tmp/nxradar-upload.json -w "%{http_code}" -X POST \
            -H "Authorization: Bearer $NXRADAR_API_KEY" \
            -H "x-org-id: $NXRADAR_ORG_ID" \
            -F "artifact=@sbom.json" \
            -F "clientId=$NXRADAR_CLIENT_ID" \
            -F "applicationName=$APP_NAME" \
            -F "applicationVersion=${BUILD_NUMBER}" \
            -F "groupName=$GROUP_NAME" \
            -F "supplier=$SUPPLIER" \
            -F "environment=$ENVIRONMENT" \
            -F "criticality=$CRITICALITY" \
            -F "ciSystem=jenkins" \
            -F "branch=${GIT_BRANCH:-master}" \
            -F "commit=$(git rev-parse HEAD)" \
            -F "pipelineId=${BUILD_TAG}" \
            "$NXRADAR_UPLOAD_URL/api/v1/scans/upload")

          echo "HTTP $HTTP_CODE"
          cat /tmp/nxradar-upload.json
          echo
          test "$HTTP_CODE" = "200" -o "$HTTP_CODE" = "201" -o "$HTTP_CODE" = "202"

          SBOM_ID=$(grep -oE '"sbomId"[[:space:]]*:[[:space:]]*"[^"]+"|"scanId"[[:space:]]*:[[:space:]]*"[^"]+"' /tmp/nxradar-upload.json | head -1 | grep -oE '"[^"]+"$' | tr -d '"')
          echo "scanId=$SBOM_ID"
          test -n "$SBOM_ID"
          echo "$SBOM_ID" > scan_id.txt
          cp /tmp/nxradar-upload.json nxradar-upload-response.json
        '''
      }
    }

    stage('Wait for processing') {
      steps {
        sh '''
          set -e
          SBOM_ID=$(cat scan_id.txt)
          echo "Polling status for $SBOM_ID ..."
          for i in $(seq 1 60); do
            CODE=$(curl -sS -o /tmp/nxradar-status.json -w "%{http_code}" \
              -H "Authorization: Bearer $NXRADAR_API_KEY" \
              -H "x-org-id: $NXRADAR_ORG_ID" \
              "$NXRADAR_UPLOAD_URL/api/v1/scans/$SBOM_ID/status" || echo 000)
            BODY=$(cat /tmp/nxradar-status.json 2>/dev/null || true)
            echo "poll $i status HTTP=$CODE body=$BODY"

            # Spec states from upload-server mapToSpecState: COMPLETED | FAILED | EVALUATING | ...
            echo "$BODY" | grep -qE '"state"[[:space:]]*:[[:space:]]*"FAILED"' && echo "PROCESSING_FAILED" && exit 1
            echo "$BODY" | grep -qE '"state"[[:space:]]*:[[:space:]]*"COMPLETED"' && echo "PROCESSING_COMPLETE" && exit 0

            sleep 15
          done
          echo "Timed out waiting for SBOM processing"
          exit 1
        '''
      }
    }

    stage('Policy decision') {
      when { expression { return env.ENABLE_POLICY_GATE == 'true' } }
      steps {
        sh '''
          set -e
          SBOM_ID=$(cat scan_id.txt)
          echo "Polling policy decision for $SBOM_ID (fail-closed) ..."
          # ~40 * 15s ≈ 10 minutes — matches prior gate wait budget
          for i in $(seq 1 40); do
            CODE=$(curl -sS -o nxradar-decision.json -w "%{http_code}" \
              -H "Authorization: Bearer $NXRADAR_API_KEY" \
              -H "x-org-id: $NXRADAR_ORG_ID" \
              "$NXRADAR_UPLOAD_URL/api/v1/scans/$SBOM_ID/decision" || echo 000)
            BODY=$(cat nxradar-decision.json 2>/dev/null || true)
            echo "poll $i decision HTTP=$CODE body=$BODY"

            # Explicit non-compliant → fail the build
            if echo "$BODY" | grep -qE '"compliant"[[:space:]]*:[[:space:]]*false'; then
              echo "POLICY_GATE_FAILED"
              exit 1
            fi

            # Explicit compliant → pass
            if echo "$BODY" | grep -qE '"compliant"[[:space:]]*:[[:space:]]*true'; then
              echo "POLICY_GATE_OK"
              exit 0
            fi

            # No boolean yet (decision:null while EVALUATING / PROCESSING) — keep polling
            sleep 15
          done

          # Fail closed: never treat a missing decision as a pass
          echo "POLICY_GATE_TIMEOUT — no compliant boolean after polling; failing build"
          exit 1
        '''
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'nxradar-*.json,sbom.json,scan_id.txt', allowEmptyArchive: true
    }
  }
}
