pipeline {
  agent any
  environment {
    NXRADAR_API_KEY    = credentials('nxradar-api-key')
    NXRADAR_ORG_ID     = '72OO5R9SCO'
    // Jenkins runs in Docker on WSL — use the WSL eth0 IP (not localhost / host.docker.internal).
    // If builds fail with curl exit 7 after a reboot, refresh with: hostname -I | awk '{print $1}'
    NXRADAR_UPLOAD_URL = 'http://172.30.7.59:7007'
    // Required: Client ObjectId from NxRadar UI (24-char hex)
    NXRADAR_CLIENT_ID  = '693bde842d84d0e636c80b89'
    // Auto-create: no APP_ID needed
    APP_NAME           = 'cicd-test-project'
    GROUP_NAME         = 'jenkins-cicd-test'
    SUPPLIER           = 'Internal'
    ENVIRONMENT        = 'Dev'
    CRITICALITY        = 'Medium'
  }
  stages {
    stage('Checkout') {
      steps { checkout scm }
    }
    stage('Upload SBOM') {
      steps {
        sh '''
          set -e
          curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b .
          # Pin CycloneDX to 1.6 — default syft emits 1.7 which sbom-utility v0.18 rejects
          ./syft . -o cyclonedx-json@1.6 > sbom.json

          # First run: creates group (if missing) + application under this client.
          # Later runs: reuses the same app and uploads a new version.
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
          echo "Upload response:"
          cat /tmp/nxradar-upload.json
          echo
          test "$HTTP_CODE" = "200" -o "$HTTP_CODE" = "201" -o "$HTTP_CODE" = "202"

          # jq is not in the Jenkins image — parse ids with grep
          SBOM_ID=$(grep -oE '"sbomId"[[:space:]]*:[[:space:]]*"[^"]+"|"scanId"[[:space:]]*:[[:space:]]*"[^"]+"' /tmp/nxradar-upload.json | head -1 | grep -oE '"[^"]+"$' | tr -d '"')
          echo "scanId=$SBOM_ID"
          test -n "$SBOM_ID"
        '''
      }
    }
  }
}
