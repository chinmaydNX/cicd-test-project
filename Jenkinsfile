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
      steps { checkout scm }
    }

    stage('Fetch nxsbom CLI') {
      steps {
        sh '''
          set -e
          mkdir -p bin
          curl -fSL -o bin/nxsbom "$NXRADAR_CLI_URL"
          chmod +x bin/nxsbom
          ./bin/nxsbom --version || ./bin/nxsbom --help | head -5
        '''
      }
    }

    stage('Generate SBOM (nxsbom CLI)') {
      steps {
        sh '''
          set -e
          export PATH="$PWD/bin:$PATH"

          # Minimal config for local generate (no --sync; upload is the next stage)
          cat > config.json <<EOF
{
  "orgId": "$NXRADAR_ORG_ID",
  "serverBaseUrl": "$NXRADAR_UPLOAD_URL"
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
            -o sbom.raw.json

          # Pin CycloneDX to 1.6 — sbom-utility v0.18 rejects Syft's default 1.7
          curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b .
          ./syft . -o cyclonedx-json@1.6 > sbom.json
          echo "SBOM ready: $(wc -c < sbom.json) bytes, specVersion=$(grep -oE '"specVersion"[[:space:]]*:[[:space:]]*"[^"]+"' sbom.json | head -1)"
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
            # Match Complete / completed / Failed / failed in response
            echo "$BODY" | grep -qiE '"[^"]*[Cc]omplete[^"]*"' && echo "PROCESSING_COMPLETE" && exit 0
            echo "$BODY" | grep -qiE '"[^"]*[Ff]ailed[^"]*"' && echo "PROCESSING_FAILED" && exit 1
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
          echo "Polling policy decision for $SBOM_ID ..."
          for i in $(seq 1 40); do
            CODE=$(curl -sS -o nxradar-decision.json -w "%{http_code}" \
              -H "Authorization: Bearer $NXRADAR_API_KEY" \
              -H "x-org-id: $NXRADAR_ORG_ID" \
              "$NXRADAR_UPLOAD_URL/api/v1/scans/$SBOM_ID/decision" || echo 000)
            BODY=$(cat nxradar-decision.json 2>/dev/null || true)
            echo "poll $i decision HTTP=$CODE body=$BODY"

            # Still pending / evaluating
            echo "$BODY" | grep -qiE 'PENDING|EVALUATING|PROCESSING|UNKNOWN' && sleep 15 && continue

            # Fail gate
            if echo "$BODY" | grep -qE '"decision"[[:space:]]*:[[:space:]]*"FAIL"|"compliant"[[:space:]]*:[[:space:]]*false'; then
              echo "POLICY_GATE_FAILED"
              exit 1
            fi

            # Pass / warn / no policy
            if echo "$BODY" | grep -qE '"decision"[[:space:]]*:[[:space:]]*"(PASS|WARN|NOT_APPLICABLE)"|"compliant"[[:space:]]*:[[:space:]]*true'; then
              echo "POLICY_GATE_OK"
              exit 0
            fi

            # If COMPLETED without FAIL, accept
            echo "$BODY" | grep -qiE 'COMPLETED|READY|Complete' && echo "POLICY_GATE_OK" && exit 0

            sleep 15
          done
          echo "Timed out waiting for policy decision — archiving last response"
          exit 0
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
