import * as api from "../api";

export interface Secret {
  // Secret name/label (this is not resource name)
  name: string;
  // This is either projectID or number
  projectId: string;
}

export interface SecretVersion {
  secret: Secret;
  versionId: string;
}

export async function listSecrets(projectId: string): Promise<Secret[]> {
  const listRes = await api.request("GET", `/v1beta1/projects/${projectId}/secrets`, {
    auth: true,
    origin: api.secretManagerOrigin,
  });
  return listRes.body.secrets.map((s: any) => parseSecretResourceName(s.name));
}

export async function getSecret(projectId: string, name: string): Promise<Secret> {
  const getRes = await api.request("GET", `/v1beta1/projects/${projectId}/secrets/${name}`, {
    auth: true,
    origin: api.secretManagerOrigin,
  });
  return parseSecretResourceName(getRes.body.name);
}

export async function getSecretLabels(
  projectId: string,
  name: string
): Promise<Record<string, string>> {
  const getRes = await api.request("GET", `/v1beta1/projects/${projectId}/secrets/${name}`, {
    auth: true,
    origin: api.secretManagerOrigin,
  });
  return getRes.body.labels;
}

export async function secretExists(projectId: string, name: string): Promise<boolean> {
  try {
    await getSecret(projectId, name);
    return true;
  } catch (err) {
    if (err.status === 404) {
      return false;
    }
    throw err;
  }
}

export function parseSecretResourceName(resourceName: string): Secret {
  const nameTokens = resourceName.split("/");
  return {
    projectId: nameTokens[1],
    name: nameTokens[3],
  };
}

export async function createSecret(
  projectId: string,
  name: string,
  labels: Record<string, string>
): Promise<Secret> {
  const createRes = await api.request(
    "POST",
    `/v1beta1/projects/${projectId}/secrets?secretId=${name}`,
    {
      auth: true,
      origin: api.secretManagerOrigin,
      data: {
        replication: {
          automatic: {},
        },
        labels,
      },
    }
  );
  return parseSecretResourceName(createRes.body.name);
}

export async function addVersion(secret: Secret, payloadData: string): Promise<SecretVersion> {
  const res = await api.request(
    "POST",
    `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:addVersion`,
    {
      auth: true,
      origin: api.secretManagerOrigin,
      data: {
        payload: {
          data: Buffer.from(payloadData).toString("base64"),
        },
      },
    }
  );
  const nameTokens = res.body.name.split("/");
  return {
    secret: {
      projectId: nameTokens[1],
      name: nameTokens[3],
    },
    versionId: nameTokens[5],
  };
}

export async function grantServiceAgentRole(
  secret: Secret,
  serviceAccountEmail: string,
  role: string
): Promise<void> {
  const getPolicyRes = await api.request(
    "GET",
    `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:getIamPolicy`,
    {
      auth: true,
      origin: api.secretManagerOrigin,
    }
  );

  const bindings = getPolicyRes.body.bindings || [];
  if (
    bindings.find(
      (b: any) =>
        b.role == role &&
        b.members.find((m: string) => m == `serviceAccount:${serviceAccountEmail}`)
    )
  ) {
    // binding already exists, short-circuit.
    return;
  }
  bindings.push({
    role: role,
    members: [`serviceAccount:${serviceAccountEmail}`],
  });

  await api.request(
    "POST",
    `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:setIamPolicy`,
    {
      auth: true,
      origin: api.secretManagerOrigin,
      data: {
        policy: {
          bindings,
        },
        updateMask: {
          paths: "bindings",
        },
      },
    }
  );
}
