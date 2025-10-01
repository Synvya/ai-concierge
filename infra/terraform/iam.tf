locals {
  account_id          = data.aws_caller_identity.current.account_id
  region              = var.aws_region
  project             = var.project_name
  ecr_repository_arn  = "arn:aws:ecr:${local.region}:${local.account_id}:repository/${local.project}-backend"
  ecs_cluster_arn     = "arn:aws:ecs:${local.region}:${local.account_id}:cluster/${local.project}-cluster"
  ecs_service_arn     = "arn:aws:ecs:${local.region}:${local.account_id}:service/${local.project}-cluster/${local.project}-service"
  ecs_taskdef_arn     = "arn:aws:ecs:${local.region}:${local.account_id}:task-definition/${local.project}-backend:*"
  deploy_role_arn     = "arn:aws:iam::${local.account_id}:role/${local.project}-deploy"
  exec_role_arn       = "arn:aws:iam::${local.account_id}:role/${local.project}-ecs-execution"
  task_role_arn       = "arn:aws:iam::${local.account_id}:role/${local.project}-ecs-task"
  elasticache_slr_arn = "arn:aws:iam::${local.account_id}:role/aws-service-role/elasticache.amazonaws.com/AWSServiceRoleForElastiCache"
  logs_group_arn      = "arn:aws:logs:${local.region}:${local.account_id}:log-group:*"

  frontend_bucket_arn  = "arn:aws:s3:::${var.frontend_bucket_name}"
  analytics_bucket_arn = "arn:aws:s3:::${var.analytics_bucket_name}"
  tf_state_bucket_arn  = var.tf_state_bucket_name != "" ? "arn:aws:s3:::${var.tf_state_bucket_name}" : ""

  bucket_arns = compact([
    local.frontend_bucket_arn,
    local.analytics_bucket_arn,
    local.tf_state_bucket_arn
  ])

  bucket_object_arns = compact([
    "${local.frontend_bucket_arn}/*",
    "${local.analytics_bucket_arn}/*",
    local.tf_state_bucket_arn != "" ? "${local.tf_state_bucket_arn}/*" : ""
  ])

  deploy_policy_document = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid      = "ECRAuth",
        Effect   = "Allow",
        Action   = ["ecr:GetAuthorizationToken"],
        Resource = "*"
      },
      {
        Sid      = "ECROps",
        Effect   = "Allow",
        Action   = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:ListTagsForResource",
          "ecr:DescribeRepositories"
        ],
        Resource = local.ecr_repository_arn
      },
      {
        Sid      = "ECRRepoMgmt",
        Effect   = "Allow",
        Action   = [
          "ecr:CreateRepository",
          "ecr:DeleteRepository",
          "ecr:GetLifecyclePolicy"
        ],
        Resource = local.ecr_repository_arn
      },
      {
        Sid    = "ECSClusterOps",
        Effect = "Allow",
        Action = [
          "ecs:CreateCluster",
          "ecs:DeleteCluster",
          "ecs:DescribeClusters",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition",
          "ecs:UpdateService",
          "ecs:ListTaskDefinitions"
        ],
        Resource = "*"
      },
      {
        Sid    = "IAMRoleMgmt",
        Effect = "Allow",
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRole",
          "iam:ListRolePolicies",
          "iam:CreateServiceLinkedRole",
          "iam:ListAttachedRolePolicies",
          "iam:GetRolePolicy",
          "iam:PutUserPolicy",
          "iam:DeleteUserPolicy",
          "iam:GetUserPolicy",
          "iam:ListUserPolicies"
        ],
        Resource = [
          local.exec_role_arn,
          local.task_role_arn,
          local.deploy_role_arn,
          local.elasticache_slr_arn
        ]
      },
      {
        Sid      = "IAMRolePass",
        Effect   = "Allow",
        Action   = ["iam:PassRole"],
        Resource = [local.exec_role_arn, local.task_role_arn]
      },
      {
        Sid    = "S3Buckets",
        Effect = "Allow",
        Action = [
          "s3:CreateBucket",
          "s3:DeleteBucket",
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:GetBucketTagging",
          "s3:PutBucketTagging",
          "s3:GetBucketVersioning",
          "s3:PutBucketVersioning",
          "s3:GetBucketPolicy",
          "s3:PutBucketPolicy",
          "s3:DeleteBucketPolicy",
          "s3:GetBucketWebsite",
          "s3:PutBucketWebsite",
          "s3:DeleteBucketWebsite",
          "s3:GetEncryptionConfiguration",
          "s3:PutEncryptionConfiguration",
          "s3:GetBucketOwnershipControls",
          "s3:PutBucketOwnershipControls",
          "s3:GetBucketPublicAccessBlock",
          "s3:PutBucketPublicAccessBlock",
          "s3:GetBucketAcl",
          "s3:GetBucketCORS",
          "s3:GetBucketLogging",
          "s3:GetBucketRequestPayment",
          "s3:GetAccelerateConfiguration",
          "s3:GetLifecycleConfiguration",
          "s3:GetReplicationConfiguration",
          "s3:GetBucketObjectLockConfiguration"
        ],
        Resource = local.bucket_arns
      },
      {
        Sid      = "S3Objects",
        Effect   = "Allow",
        Action   = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucketMultipartUploads",
          "s3:AbortMultipartUpload"
        ],
        Resource = local.bucket_object_arns
      },
      {
        Sid      = "SecretsRead",
        Effect   = "Allow",
        Action   = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ],
        Resource = "*"
      },
      {
        Sid    = "ElasticacheMgmt",
        Effect = "Allow",
        Action = [
          "elasticache:DescribeReplicationGroups",
          "elasticache:CreateReplicationGroup",
          "elasticache:ModifyReplicationGroup",
          "elasticache:DeleteReplicationGroup",
          "elasticache:DescribeCacheSubnetGroups",
          "elasticache:CreateCacheSubnetGroup",
          "elasticache:ModifyCacheSubnetGroup",
          "elasticache:DeleteCacheSubnetGroup",
          "elasticache:ListTagsForResource",
          "elasticache:DescribeCacheClusters"
        ],
        Resource = "*"
      },
      {
        Sid    = "EC2Networking",
        Effect = "Allow",
        Action = [
          "ec2:DescribeVpcs",
          "ec2:DescribeVpcAttribute",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeRouteTables",
          "ec2:DescribeInternetGateways",
          "ec2:CreateSecurityGroup",
          "ec2:DeleteSecurityGroup",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupEgress"
        ],
        Resource = "*"
      },
      {
        Sid    = "ELBv2",
        Effect = "Allow",
        Action = [
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:CreateLoadBalancer",
          "elasticloadbalancing:DeleteLoadBalancer",
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:DeleteTargetGroup",
          "elasticloadbalancing:CreateListener",
          "elasticloadbalancing:DeleteListener",
          "elasticloadbalancing:ModifyLoadBalancerAttributes",
          "elasticloadbalancing:ModifyTargetGroup",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
          "elasticloadbalancing:DescribeTargetGroupAttributes",
          "elasticloadbalancing:DescribeLoadBalancerAttributes",
          "elasticloadbalancing:DescribeTags",
          "elasticloadbalancing:DescribeListeners",
          "elasticloadbalancing:DescribeListenerAttributes",
          "elasticloadbalancing:ModifyListener"
        ],
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogs",
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:ListTagsForResource"
        ],
        Resource = local.logs_group_arn
      }
    ]
  })
}

resource "aws_iam_role" "github_actions" {
  name = "ai-concierge-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
        },
        Action = "sts:AssumeRoleWithWebIdentity",
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          },
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:Synvya/ai-concierge:*"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "ai-concierge-deploy-policy"
  role   = aws_iam_role.github_actions.id
  policy = local.deploy_policy_document
}

resource "aws_iam_user_policy" "deployer_users" {
  for_each = toset(var.deployer_user_names)
  name     = "${local.project}-deploy-inline"
  user     = each.value
  policy   = local.deploy_policy_document
}
